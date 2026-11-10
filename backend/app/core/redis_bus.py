"""
Distributed command queue and streaming pub/sub bus for agent console commands.

Provides CommandBus with Redis List/PubSub backing when settings.REDIS_URL is configured,
seamlessly falling back to thread-safe in-memory asyncio structures when Redis is offline
or absent.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import AsyncGenerator
from typing import Any

import redis.asyncio as aioredis
from redis.exceptions import RedisError

from app.core.config import settings

logger = logging.getLogger(__name__)


class CommandBus:
    """Distributed command queue and streaming bus for live agent console commands.

    Uses Redis lists and pub/sub when settings.REDIS_URL is configured and reachable.
    Seamlessly falls back to thread-safe in-memory queues and dictionaries when
    Redis is unavailable or unconfigured.
    """

    def __init__(
        self,
        redis_url: str | None = None,
        redis_client: aioredis.Redis | None = None,
    ) -> None:
        self._redis_url = redis_url
        self._redis = redis_client
        self._lock = asyncio.Lock()
        self._pending: dict[str, list[dict[str, Any]]] = {}
        self._ws_queues: dict[str, asyncio.Queue] = {}
        self._command_agents: dict[str, str] = {}
        self._pubsub_tasks: dict[str, tuple[Any, asyncio.Task]] = {}

    async def _get_redis(self) -> aioredis.Redis | None:
        if self._redis is not None:
            return self._redis
        url = self._redis_url if self._redis_url is not None else settings.REDIS_URL
        if not url:
            return None
        try:
            client = aioredis.from_url(
                url,
                socket_connect_timeout=1.5,
                socket_timeout=2.0,
                decode_responses=True,
            )
            await client.ping()
            self._redis = client
            return self._redis
        except Exception as exc:
            logger.warning(
                "Redis connection to %s failed, falling back to in-memory command bus: %s",
                url,
                exc,
            )
            self._redis = None
            return None

    async def enqueue_command(self, agent_id: str, command: dict[str, Any]) -> None:
        """Enqueue an ad-hoc command destined for a connected agent."""
        command_id = str(command.get("command_id", ""))
        timeout_sec = int(command.get("timeout_sec", 30))
        ttl = timeout_sec + 120

        client = await self._get_redis()
        if client:
            try:
                await client.lpush(f"dfir:agent:commands:{agent_id}", json.dumps(command))
                if command_id:
                    await client.set(f"dfir:command:agent:{command_id}", agent_id, ex=ttl)
            except (RedisError, ConnectionError, OSError) as exc:
                logger.warning(
                    "Redis enqueue error for agent %s, falling back to local: %s", agent_id, exc
                )
                self._redis = None

        async with self._lock:
            self._pending.setdefault(agent_id, []).append(command)
            if command_id:
                self._command_agents[command_id] = agent_id

    async def pop_command(self, agent_id: str) -> dict[str, Any] | None:
        """Pop the next active (unexpired) command for the agent."""
        now = time.time()
        client = await self._get_redis()
        if client:
            try:
                while True:
                    raw = await client.rpop(f"dfir:agent:commands:{agent_id}")
                    if raw is None:
                        break
                    if isinstance(raw, (bytes, bytearray)):
                        raw = raw.decode("utf-8")
                    entry = json.loads(raw)
                    if float(entry.get("expires_at", 0)) > now:
                        # Clean local mirror
                        async with self._lock:
                            pending = self._pending.get(agent_id, [])
                            self._pending[agent_id] = [
                                c for c in pending if c.get("command_id") != entry.get("command_id")
                            ]
                            if not self._pending[agent_id]:
                                self._pending.pop(agent_id, None)
                        return entry
            except (RedisError, ConnectionError, OSError) as exc:
                logger.warning("Redis pop error for agent %s, using fallback: %s", agent_id, exc)
                self._redis = None

        # In-memory fallback
        async with self._lock:
            queue = self._pending.get(agent_id, [])
            while queue and float(queue[0].get("expires_at", 0)) <= now:
                queue.pop(0)
            if not queue:
                self._pending.pop(agent_id, None)
                return None
            entry = queue.pop(0)
            if not queue:
                self._pending.pop(agent_id, None)
            return entry

    async def get_command_agent(self, command_id: str) -> str | None:
        """Resolve which agent a command_id belongs to."""
        client = await self._get_redis()
        if client:
            try:
                val = await client.get(f"dfir:command:agent:{command_id}")
                if val is not None:
                    return val.decode("utf-8") if isinstance(val, (bytes, bytearray)) else str(val)
            except (RedisError, ConnectionError, OSError) as exc:
                logger.warning("Redis get_command_agent error for %s: %s", command_id, exc)
                self._redis = None

        async with self._lock:
            return self._command_agents.get(command_id)

    async def remove_command(self, agent_id: str, command_id: str) -> None:
        """Remove a pending command from the queue before or after timeout."""
        client = await self._get_redis()
        if client:
            try:
                items = await client.lrange(f"dfir:agent:commands:{agent_id}", 0, -1)
                for raw in items:
                    try:
                        decoded = (
                            raw.decode("utf-8") if isinstance(raw, (bytes, bytearray)) else raw
                        )
                        data = json.loads(decoded)
                        if data.get("command_id") == command_id:
                            await client.lrem(f"dfir:agent:commands:{agent_id}", 0, raw)
                    except Exception:
                        pass
            except (RedisError, ConnectionError, OSError) as exc:
                logger.warning("Redis remove_command error: %s", exc)
                self._redis = None

        async with self._lock:
            pending = self._pending.get(agent_id, [])
            self._pending[agent_id] = [c for c in pending if c.get("command_id") != command_id]
            if not self._pending[agent_id]:
                self._pending.pop(agent_id, None)

    async def register_listener(self, command_id: str) -> asyncio.Queue:
        """Register an output listener queue for a command."""
        async with self._lock:
            q: asyncio.Queue = asyncio.Queue()
            self._ws_queues[command_id] = q

        client = await self._get_redis()
        if client:
            try:
                pubsub = client.pubsub()
                channel = f"dfir:console:command:{command_id}"
                await pubsub.subscribe(channel)

                async def _pump() -> None:
                    try:
                        async for item in pubsub.listen():
                            if item.get("type") == "message":
                                data = item.get("data")
                                if isinstance(data, (bytes, bytearray)):
                                    data = data.decode("utf-8")
                                if isinstance(data, str):
                                    try:
                                        msg = json.loads(data)
                                    except Exception:
                                        msg = {"type": "output", "chunk": data}
                                else:
                                    msg = data
                                await q.put(msg)
                                if isinstance(msg, dict) and msg.get("type") in ("done", "error"):
                                    break
                    except asyncio.CancelledError:
                        pass
                    except Exception as exc:
                        logger.debug("Pubsub pump error for %s: %s", command_id, exc)
                    finally:
                        try:
                            await pubsub.unsubscribe(channel)
                            await pubsub.aclose()
                        except Exception:
                            pass

                task = asyncio.create_task(_pump())
                async with self._lock:
                    self._pubsub_tasks[command_id] = (pubsub, task)
            except (RedisError, ConnectionError, OSError) as exc:
                logger.warning("Failed to start Redis pubsub pump for %s: %s", command_id, exc)
                self._redis = None

        return q

    async def unregister_listener(self, command_id: str) -> None:
        """Unregister an output listener and clean up associated resources."""
        async with self._lock:
            entry = self._pubsub_tasks.pop(command_id, None)
        if entry:
            pubsub, task = entry
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass

        agent_id = await self.get_command_agent(command_id)
        if agent_id:
            await self.remove_command(agent_id, command_id)

        client = await self._get_redis()
        if client:
            try:
                await client.delete(f"dfir:command:agent:{command_id}")
            except (RedisError, ConnectionError, OSError):
                pass

        async with self._lock:
            self._ws_queues.pop(command_id, None)
            self._command_agents.pop(command_id, None)

    async def publish_output(self, command_id: str, message: dict[str, Any]) -> bool:
        """Publish an output chunk or completion message for a command."""
        published_redis = False
        client = await self._get_redis()
        if client:
            try:
                channel = f"dfir:console:command:{command_id}"
                recipients = await client.publish(channel, json.dumps(message))
                if recipients > 0:
                    published_redis = True
            except (RedisError, ConnectionError, OSError) as exc:
                logger.warning("Redis publish error for %s: %s", command_id, exc)
                self._redis = None

        delivered_local = False
        async with self._lock:
            q = self._ws_queues.get(command_id)
            if q is not None:
                # If Redis delivered via pubsub to local listener, avoid duplicate if pump is running
                if not published_redis or command_id not in self._pubsub_tasks:
                    await q.put(message)
                delivered_local = True

        return published_redis or delivered_local

    async def subscribe_output(
        self, command_id: str, timeout: float | None = None
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Async generator yielding output events for a command until done or error."""
        q = await self.register_listener(command_id)
        try:
            while True:
                if timeout is not None:
                    msg = await asyncio.wait_for(q.get(), timeout=timeout)
                else:
                    msg = await q.get()
                yield msg
                if isinstance(msg, dict) and msg.get("type") in ("done", "error"):
                    break
        finally:
            await self.unregister_listener(command_id)

    async def clear(self) -> None:
        """Reset in-memory state (primarily for test isolation)."""
        async with self._lock:
            tasks = list(self._pubsub_tasks.values())
            self._pubsub_tasks.clear()
        for pubsub, task in tasks:
            task.cancel()
            try:
                await task
            except Exception:
                pass
        async with self._lock:
            self._pending.clear()
            self._ws_queues.clear()
            self._command_agents.clear()

    async def aclose(self) -> None:
        """Close connections and clean up tasks."""
        await self.clear()
        if self._redis is not None:
            try:
                await self._redis.aclose()
            except Exception:
                pass
            self._redis = None


command_bus = CommandBus()

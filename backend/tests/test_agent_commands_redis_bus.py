"""
Unit tests for distributed Redis command bus and in-memory resilient fallback.

Verifies:
  - Memory fallback mode: FIFO queue, TTL expiry, agent resolution, listener registration,
    and streaming chunk/done events.
  - Redis mode: LPUSH, RPOP, key expiration, Pub/Sub channel distribution, listener pump,
    and cleanup.
  - Redis error handling: automatic, seamless fallback to in-memory structures when Redis fails.
  - Async generator `subscribe_output` yielding stream events and terminating on done/error.
"""

from __future__ import annotations

import asyncio
import json
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from redis.exceptions import ConnectionError, RedisError

from app.api.v1.endpoints import agent_commands
from app.core.redis_bus import CommandBus


class MockPubSub:
    """Mock Redis PubSub subscriber."""

    def __init__(self, broker: MockRedis) -> None:
        self.broker = broker
        self.channels: set[str] = set()
        self.queue: asyncio.Queue = asyncio.Queue()

    async def subscribe(self, *channels: str) -> None:
        for c in channels:
            self.channels.add(c)
            self.broker.subscribers.setdefault(c, []).append(self)

    async def unsubscribe(self, *channels: str) -> None:
        for c in channels:
            self.channels.discard(c)
            if c in self.broker.subscribers and self in self.broker.subscribers[c]:
                self.broker.subscribers[c].remove(self)

    async def aclose(self) -> None:
        for c in list(self.channels):
            await self.unsubscribe(c)

    async def listen(self):
        while True:
            msg = await self.queue.get()
            yield msg


class MockRedis:
    """Mock Redis client implementing list operations, key-value storage, and pub/sub."""

    def __init__(self) -> None:
        self.lists: dict[str, list[str]] = {}
        self.keys: dict[str, str] = {}
        self.subscribers: dict[str, list[MockPubSub]] = {}
        self.lpush_calls: list[tuple[str, str]] = []
        self.rpop_calls: list[str] = []
        self.publish_calls: list[tuple[str, str]] = []
        self.closed = False

    async def ping(self) -> bool:
        return True

    async def lpush(self, key: str, *values: str) -> int:
        for val in values:
            self.lpush_calls.append((key, val))
            self.lists.setdefault(key, []).insert(0, val)
        return len(self.lists[key])

    async def rpop(self, key: str) -> str | None:
        self.rpop_calls.append(key)
        lst = self.lists.get(key, [])
        if not lst:
            return None
        return lst.pop()

    async def lrange(self, key: str, start: int, end: int) -> list[str]:
        lst = self.lists.get(key, [])
        if end == -1:
            return lst[start:]
        return lst[start : end + 1]

    async def lrem(self, key: str, count: int, value: str) -> int:
        lst = self.lists.get(key, [])
        if value in lst:
            lst.remove(value)
            return 1
        return 0

    async def set(self, key: str, value: str, ex: int | None = None) -> bool:
        self.keys[key] = value
        return True

    async def get(self, key: str) -> str | None:
        return self.keys.get(key)

    async def delete(self, *keys: str) -> int:
        count = 0
        for k in keys:
            if k in self.keys:
                del self.keys[k]
                count += 1
            if k in self.lists:
                del self.lists[k]
                count += 1
        return count

    async def publish(self, channel: str, message: str) -> int:
        self.publish_calls.append((channel, message))
        subs = list(self.broker_subscribers(channel))
        for sub in subs:
            await sub.queue.put({"type": "message", "channel": channel, "data": message})
        return len(subs)

    def broker_subscribers(self, channel: str) -> list[MockPubSub]:
        return list(self.subscribers.get(channel, []))

    def pubsub(self) -> MockPubSub:
        return MockPubSub(self)

    async def aclose(self) -> None:
        self.closed = True


# ── In-Memory Mode Tests ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_command_bus_memory_enqueue_and_pop():
    """Verify in-memory FIFO queue behavior and agent resolution."""
    bus = CommandBus()

    cmd1 = {
        "command_id": "CMD-001",
        "cmd": "whoami",
        "timeout_sec": 30,
        "expires_at": time.time() + 60,
    }
    cmd2 = {
        "command_id": "CMD-002",
        "cmd": "hostname",
        "timeout_sec": 30,
        "expires_at": time.time() + 60,
    }

    await bus.enqueue_command("agent-alpha", cmd1)
    await bus.enqueue_command("agent-alpha", cmd2)

    assert await bus.get_command_agent("CMD-001") == "agent-alpha"
    assert await bus.get_command_agent("CMD-002") == "agent-alpha"
    assert await bus.get_command_agent("CMD-NONEXISTENT") is None

    # Pop in FIFO order
    popped1 = await bus.pop_command("agent-alpha")
    assert popped1 is not None
    assert popped1["command_id"] == "CMD-001"
    assert popped1["cmd"] == "whoami"

    popped2 = await bus.pop_command("agent-alpha")
    assert popped2 is not None
    assert popped2["command_id"] == "CMD-002"

    popped_none = await bus.pop_command("agent-alpha")
    assert popped_none is None


@pytest.mark.asyncio
async def test_command_bus_memory_expired_command_pruning():
    """Verify expired commands in queue are discarded on pop."""
    bus = CommandBus()

    expired_cmd = {
        "command_id": "CMD-EXPIRED",
        "cmd": "old command",
        "timeout_sec": 5,
        "expires_at": time.time() - 10,  # Expired
    }
    valid_cmd = {
        "command_id": "CMD-VALID",
        "cmd": "current command",
        "timeout_sec": 30,
        "expires_at": time.time() + 60,
    }

    await bus.enqueue_command("agent-bravo", expired_cmd)
    await bus.enqueue_command("agent-bravo", valid_cmd)

    # Expired command should be discarded; valid command returned
    popped = await bus.pop_command("agent-bravo")
    assert popped is not None
    assert popped["command_id"] == "CMD-VALID"


@pytest.mark.asyncio
async def test_command_bus_memory_remove_command():
    """Verify removal of a pending command before polling."""
    bus = CommandBus()

    cmd1 = {"command_id": "CMD-REM-1", "cmd": "dir", "expires_at": time.time() + 60}
    cmd2 = {"command_id": "CMD-REM-2", "cmd": "ls", "expires_at": time.time() + 60}

    await bus.enqueue_command("agent-charlie", cmd1)
    await bus.enqueue_command("agent-charlie", cmd2)

    await bus.remove_command("agent-charlie", "CMD-REM-1")

    popped = await bus.pop_command("agent-charlie")
    assert popped is not None
    assert popped["command_id"] == "CMD-REM-2"
    assert await bus.pop_command("agent-charlie") is None


@pytest.mark.asyncio
async def test_command_bus_memory_publish_and_listener():
    """Verify output chunk publishing and listener unregistration in memory mode."""
    bus = CommandBus()
    command_id = "CMD-LISTEN-1"

    # Publishing with no listener returns False
    published = await bus.publish_output(command_id, {"type": "output", "chunk": "data"})
    assert published is False

    # Register listener
    queue = await bus.register_listener(command_id)
    assert queue is not None

    published = await bus.publish_output(command_id, {"type": "output", "chunk": "hello "})
    assert published is True

    await bus.publish_output(command_id, {"type": "output", "chunk": "world\n"})
    await bus.publish_output(command_id, {"type": "done", "exit_code": 0})

    msg1 = await queue.get()
    assert msg1 == {"type": "output", "chunk": "hello "}
    msg2 = await queue.get()
    assert msg2 == {"type": "output", "chunk": "world\n"}
    msg3 = await queue.get()
    assert msg3 == {"type": "done", "exit_code": 0}

    await bus.unregister_listener(command_id)
    assert command_id not in bus._ws_queues


@pytest.mark.asyncio
async def test_command_bus_subscribe_output_generator():
    """Verify subscribe_output async generator in memory mode."""
    bus = CommandBus()
    command_id = "CMD-GEN-1"

    async def producer():
        await asyncio.sleep(0.01)
        await bus.publish_output(command_id, {"type": "output", "chunk": "line1\n"})
        await bus.publish_output(command_id, {"type": "output", "chunk": "line2\n"})
        await bus.publish_output(command_id, {"type": "done", "exit_code": 0})

    task = asyncio.create_task(producer())

    chunks: list[dict] = []
    async for event in bus.subscribe_output(command_id):
        chunks.append(event)

    await task
    assert len(chunks) == 3
    assert chunks[0]["chunk"] == "line1\n"
    assert chunks[1]["chunk"] == "line2\n"
    assert chunks[2]["type"] == "done"
    assert command_id not in bus._ws_queues


# ── Redis Mode Tests ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_command_bus_redis_enqueue_and_pop():
    """Verify Redis list LPUSH and RPOP are used when Redis is connected."""
    mock_redis = MockRedis()
    bus = CommandBus(redis_client=mock_redis)

    cmd = {
        "command_id": "CMD-REDIS-1",
        "cmd": "Get-Process",
        "timeout_sec": 45,
        "expires_at": time.time() + 90,
    }

    await bus.enqueue_command("agent-win01", cmd)

    # Verify Redis list and key were populated
    assert len(mock_redis.lpush_calls) == 1
    assert mock_redis.lpush_calls[0][0] == "dfir:agent:commands:agent-win01"
    pushed_payload = json.loads(mock_redis.lpush_calls[0][1])
    assert pushed_payload["command_id"] == "CMD-REDIS-1"
    assert mock_redis.keys["dfir:command:agent:CMD-REDIS-1"] == "agent-win01"

    # Verify get_command_agent reads from Redis
    agent = await bus.get_command_agent("CMD-REDIS-1")
    assert agent == "agent-win01"

    # Pop from Redis
    popped = await bus.pop_command("agent-win01")
    assert popped is not None
    assert popped["command_id"] == "CMD-REDIS-1"
    assert len(mock_redis.rpop_calls) == 1
    assert mock_redis.rpop_calls[0] == "dfir:agent:commands:agent-win01"


@pytest.mark.asyncio
async def test_command_bus_redis_pubsub_streaming():
    """Verify Redis PubSub subscription and publishing deliver messages across channels."""
    mock_redis = MockRedis()
    bus = CommandBus(redis_client=mock_redis)
    command_id = "CMD-REDIS-PUBSUB"

    # Register listener on worker A (subscribes to Redis channel)
    queue = await bus.register_listener(command_id)
    assert command_id in bus._pubsub_tasks

    channel = f"dfir:console:command:{command_id}"
    assert channel in mock_redis.subscribers
    assert len(mock_redis.subscribers[channel]) == 1

    # Publish from simulated worker B
    delivered1 = await bus.publish_output(command_id, {"type": "output", "chunk": "systeminfo\n"})
    assert delivered1 is True
    assert len(mock_redis.publish_calls) == 1

    delivered2 = await bus.publish_output(command_id, {"type": "done", "exit_code": 0})
    assert delivered2 is True

    # Listener receives the messages through the Redis pubsub pump
    msg1 = await asyncio.wait_for(queue.get(), timeout=1.0)
    assert msg1["type"] == "output"
    assert msg1["chunk"] == "systeminfo\n"

    msg2 = await asyncio.wait_for(queue.get(), timeout=1.0)
    assert msg2["type"] == "done"
    assert msg2["exit_code"] == 0

    # Unregister listener cleans up pubsub task and keys
    await bus.unregister_listener(command_id)
    assert command_id not in bus._pubsub_tasks
    assert channel not in mock_redis.subscribers or len(mock_redis.subscribers[channel]) == 0


@pytest.mark.asyncio
async def test_command_bus_redis_remove_command():
    """Verify remove_command prunes from Redis list."""
    mock_redis = MockRedis()
    bus = CommandBus(redis_client=mock_redis)

    cmd1 = {"command_id": "CMD-R1", "cmd": "c1", "expires_at": time.time() + 60}
    cmd2 = {"command_id": "CMD-R2", "cmd": "c2", "expires_at": time.time() + 60}

    await bus.enqueue_command("agent-delta", cmd1)
    await bus.enqueue_command("agent-delta", cmd2)

    await bus.remove_command("agent-delta", "CMD-R1")

    popped = await bus.pop_command("agent-delta")
    assert popped is not None
    assert popped["command_id"] == "CMD-R2"
    assert await bus.pop_command("agent-delta") is None


@pytest.mark.asyncio
async def test_command_bus_redis_failure_falls_back_to_memory():
    """Verify when Redis throws RedisError, bus smoothly falls back to memory without crash."""
    failing_redis = AsyncMock()
    failing_redis.lpush.side_effect = ConnectionError("Redis host unreachable")
    failing_redis.rpop.side_effect = RedisError("Connection dropped")

    bus = CommandBus(redis_client=failing_redis)

    cmd = {
        "command_id": "CMD-FAIL-1",
        "cmd": "whoami",
        "timeout_sec": 30,
        "expires_at": time.time() + 60,
    }

    # Enqueue should not raise; falls back to in-memory
    await bus.enqueue_command("agent-failover", cmd)
    assert "agent-failover" in bus._pending

    # Pop should not raise; falls back to in-memory
    popped = await bus.pop_command("agent-failover")
    assert popped is not None
    assert popped["command_id"] == "CMD-FAIL-1"


# ── Integration with agent_commands Endpoint Flow ──────────────────────────────


@pytest.mark.asyncio
async def test_agent_commands_endpoints_with_command_bus(monkeypatch):
    """Verify poll_for_command, post_command_result, and run_command_sync through command_bus."""
    from app.core.redis_bus import command_bus

    await command_bus.clear()

    monkeypatch.setattr(
        agent_commands, "get_device", AsyncMock(return_value=SimpleNamespace(id="agent-int-test"))
    )
    monkeypatch.setattr(agent_commands, "verify_agent_secret", lambda *_: None)
    monkeypatch.setattr(agent_commands, "record_event", AsyncMock())
    db = AsyncMock()

    sync_task = asyncio.create_task(
        agent_commands.run_command_sync(
            "agent-int-test",
            {"cmd": "dir"},
            SimpleNamespace(role="admin", username="test_operator"),
            db,
        )
    )

    # Wait for command to be enqueued
    for _ in range(20):
        await asyncio.sleep(0.01)
        if command_bus._pending.get("agent-int-test"):
            break

    # 1. Agent polls for command
    cmd_data = await agent_commands.poll_for_command("agent-int-test", "secret", db)
    assert cmd_data["cmd"] == "dir"
    command_id = cmd_data["command_id"]

    # 2. Agent submits result
    result_res = await agent_commands.post_command_result(
        command_id,
        {"output": "Volume in drive C is OS\n", "exit_code": 0},
        "secret",
        db,
    )
    assert result_res == {"status": "ok"}

    # 3. Synchronous endpoint receives output
    response = await asyncio.wait_for(sync_task, timeout=2.0)
    assert response["output"] == "Volume in drive C is OS\n"
    assert response["exit_code"] == 0
    assert command_id not in command_bus._ws_queues

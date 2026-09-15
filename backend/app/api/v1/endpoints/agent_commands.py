"""
Real-time agent command interface (R-1: Live Agent Commands).

Analysts send ad-hoc shell commands to a connected agent and see output streamed
back in real time — no full collection job required.

WebSocket protocol (JSON frames over ws://.../ws/{agent_id}?token=<JWT>):
  Analyst  → Server: {"cmd": "ipconfig /all", "timeout_sec": 30}
  Server   → Analyst: {"type": "queued",  "command_id": "..."}
  Server   → Analyst: {"type": "output",  "chunk": "...text..."}
  Server   → Analyst: {"type": "done",    "exit_code": 0}
  Server   → Analyst: {"type": "error",   "message": "..."}
  Server   → Analyst: {"type": "ping"}   (keepalive every 15s)

Agent endpoints:
  GET  /agent-commands/poll/{agent_id}        → next pending command (or {})
  POST /agent-commands/result/{command_id}    → submit output + exit_code
  POST /agent-commands/run/{agent_id}         → synchronous REST alternative
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from urllib.parse import urlparse
from uuid import uuid4

from fastapi import (
    APIRouter,
    Depends,
    Header,
    HTTPException,
)
from fastapi import Query as FastAPIQuery
from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.agents import verify_agent_secret
from app.core.config import settings
from app.core.deps import get_current_user, get_db
from app.crud.device import get_device
from app.models.user import User
from app.services.audit_log_service import record_event

logger = logging.getLogger(__name__)
router = APIRouter()

# ── In-memory command queues ───────────────────────────────────────────────────
# _pending: agent_id → list of command dicts waiting to be picked up by the agent
# _ws_queues: command_id → asyncio.Queue receiving chunks from the agent
_pending: dict[str, list[dict]] = {}
_ws_queues: dict[str, asyncio.Queue] = {}
_command_agents: dict[str, str] = {}
_pending_lock = asyncio.Lock()

# Maximum allowed command timeout (seconds)
_MAX_TIMEOUT_SEC = 300
_MAX_COMMAND_CHARS = 4096
_MAX_OUTPUT_CHARS = 1_000_000


def _validate_command(payload: object) -> tuple[str, int]:
    if not isinstance(payload, dict) or not isinstance(payload.get("cmd"), str):
        raise ValueError("cmd must be a string")
    cmd = payload["cmd"].strip()
    if not cmd or len(cmd) > _MAX_COMMAND_CHARS:
        raise ValueError("cmd must contain between 1 and 4096 characters")
    timeout = payload.get("timeout_sec", 30)
    if (
        isinstance(timeout, bool)
        or not isinstance(timeout, int)
        or not 1 <= timeout <= _MAX_TIMEOUT_SEC
    ):
        raise ValueError("timeout_sec must be an integer between 1 and 300")
    return cmd, timeout


async def _authorize_console_session(token: str) -> str:
    from jwt import InvalidTokenError

    from app.core.security import decode_access_token, is_token_revoked
    from app.crud.user import get_user_by_username
    from app.db.session import AsyncSessionLocal

    payload = decode_access_token(token)
    if not payload.get("sub") or (payload.get("jti") and is_token_revoked(payload["jti"])):
        raise InvalidTokenError("Invalid or revoked session")
    async with AsyncSessionLocal() as db:
        user = await get_user_by_username(db, str(payload["sub"]))
        if not user or user.status.lower() != "active" or user.role not in ("admin", "operator"):
            raise InvalidTokenError("Session no longer authorized")
        return user.username


def Query(default: object = ..., **kwargs: object):
    """Keep the legacy token query parameter optional during cookie migration."""
    return FastAPIQuery(None if default is ... else default, **kwargs)


def _is_allowed_websocket_origin(websocket: WebSocket) -> bool:
    """Allow only the application origin for cookie-authenticated WebSockets."""
    origin = websocket.headers.get("origin")
    host = websocket.headers.get("host", "").lower()
    if not origin or not host:
        return False
    try:
        if urlparse(origin).netloc.lower() == host:
            return True
    except ValueError:
        return False
    trusted = {
        value.strip().rstrip("/") for value in settings.ALLOWED_ORIGINS.split(",") if value.strip()
    }
    return "*" not in trusted and origin.rstrip("/") in trusted


# ── Analyst WebSocket endpoint ────────────────────────────────────────────────


@router.websocket("/ws/{agent_id}")
async def analyst_ws(
    agent_id: str,
    websocket: WebSocket,
    token: str = Query(..., description="Bearer JWT — sent as ?token=... (WS can't set headers)"),
) -> None:
    """Stream live command output to an analyst."""
    from jwt import InvalidTokenError

    if not _is_allowed_websocket_origin(websocket):
        await websocket.close(code=4003, reason="Untrusted WebSocket origin")
        return
    # Ignore any legacy query-string value.  The browser presents the HttpOnly
    # cookie automatically for a same-origin WebSocket upgrade.
    token = websocket.cookies.get(settings.AUTH_COOKIE_NAME)
    if not token:
        await websocket.close(code=4001, reason="Missing session")
        return

    try:
        analyst_name = await _authorize_console_session(token)
    except InvalidTokenError:
        await websocket.close(code=4001, reason="Invalid token")
        return

    await websocket.accept()
    logger.info("Analyst WS connected for agent %s", agent_id)

    try:
        while True:
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=60.0)
            except asyncio.TimeoutError:
                await websocket.send_text(json.dumps({"type": "ping"}))
                continue

            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({"type": "error", "message": "Invalid JSON"}))
                continue

            try:
                cmd, timeout_sec = _validate_command(msg)
            except ValueError as exc:
                await websocket.send_text(json.dumps({"type": "error", "message": str(exc)}))
                continue

            # Re-check session state for every command. Long-lived WebSockets
            # must honor expiry, revocation, and role changes after connect.
            try:
                analyst_name = await _authorize_console_session(token)
            except InvalidTokenError:
                await websocket.close(code=4001, reason="Session expired")
                return
            if not cmd:
                await websocket.send_text(
                    json.dumps({"type": "error", "message": "cmd is required"})
                )
                continue
            if len(cmd) > _MAX_COMMAND_CHARS:
                await websocket.send_text(
                    json.dumps({"type": "error", "message": "cmd exceeds 4096 characters"})
                )
                continue

            command_id = f"CMD-{uuid4().hex[:12].upper()}"
            result_queue: asyncio.Queue = asyncio.Queue()

            try:
                from app.db.session import AsyncSessionLocal

                async with AsyncSessionLocal() as audit_db:
                    if not await get_device(audit_db, agent_id):
                        await websocket.send_text(
                            json.dumps({"type": "error", "message": "Agent not found"})
                        )
                        continue
                    await record_event(
                        audit_db,
                        event_type="agent.command.submitted",
                        actor_type="user",
                        actor_id=analyst_name,
                        source="websocket",
                        action="run_command",
                        target_type="agent",
                        target_id=agent_id,
                        status="queued",
                        message=cmd[:500],
                        metadata={"command_id": command_id},
                    )
                    await audit_db.commit()
            except Exception as exc:
                logger.warning("Audit log for WS command failed: %s", exc)
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "error",
                            "message": "Unable to record command audit; command was not queued",
                        }
                    )
                )
                continue

            async with _pending_lock:
                _pending.setdefault(agent_id, []).append(
                    {
                        "command_id": command_id,
                        "cmd": cmd,
                        "timeout_sec": timeout_sec,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "expires_at": time.time() + timeout_sec + 30,
                    }
                )
                _ws_queues[command_id] = result_queue
                _command_agents[command_id] = agent_id

            deadline = time.monotonic() + timeout_sec + 30
            try:
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "queued",
                            "command_id": command_id,
                            "message": f"Queued — waiting for agent {agent_id}",
                        }
                    )
                )
                while True:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        await websocket.send_text(
                            json.dumps(
                                {
                                    "type": "error",
                                    "message": "Timed out waiting for agent response",
                                }
                            )
                        )
                        break
                    try:
                        chunk = await asyncio.wait_for(
                            result_queue.get(), timeout=min(remaining, 5.0)
                        )
                    except asyncio.TimeoutError:
                        await websocket.send_text(json.dumps({"type": "ping"}))
                        continue
                    await websocket.send_text(json.dumps(chunk))
                    if chunk.get("type") in ("done", "error"):
                        break
            finally:
                async with _pending_lock:
                    pending = _pending.get(agent_id, [])
                    _pending[agent_id] = [
                        entry for entry in pending if entry["command_id"] != command_id
                    ]
                    if not _pending[agent_id]:
                        _pending.pop(agent_id, None)
                    _ws_queues.pop(command_id, None)
                    _command_agents.pop(command_id, None)
    except WebSocketDisconnect:
        logger.info("Analyst WS disconnected for agent %s", agent_id)
    except Exception as exc:
        logger.warning("Analyst WS error for agent %s: %s", agent_id, exc)
        try:
            await websocket.close(code=1011)
        except Exception:
            pass


# ── Agent poll endpoint ────────────────────────────────────────────────────────


@router.get("/poll/{agent_id}")
async def poll_for_command(
    agent_id: str,
    agent_token: str | None = Header(default=None, alias="X-Agent-Token"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Agent calls this endpoint periodically to check for pending commands."""
    verify_agent_secret(agent_token, await get_device(db, agent_id))
    async with _pending_lock:
        queue = _pending.get(agent_id, [])
        now = time.time()
        while queue and float(queue[0].get("expires_at", 0)) <= now:
            queue.pop(0)
        if not queue:
            _pending.pop(agent_id, None)
            return {}
        entry = queue.pop(0)
        if not queue:
            _pending.pop(agent_id, None)
    return {
        "command_id": entry["command_id"],
        "cmd": entry["cmd"],
        "timeout_sec": entry["timeout_sec"],
    }


@router.post("/result/{command_id}")
async def post_command_result(
    command_id: str,
    payload: dict,
    agent_token: str | None = Header(default=None, alias="X-Agent-Token"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Agent posts execution output back to the waiting analyst WebSocket."""
    # Authenticate before exposing whether a command has an active subscriber.
    # Unknown/expired commands use the bootstrap credential for backward
    # compatibility; known commands are bound to their registered device.
    agent_id = _command_agents.get(command_id)
    verify_agent_secret(agent_token, await get_device(db, agent_id) if agent_id else None)
    result_queue = _ws_queues.get(command_id)
    if result_queue is None:
        return {"status": "no_subscriber"}

    output = str(payload.get("output", ""))
    if len(output) > _MAX_OUTPUT_CHARS:
        raise HTTPException(status_code=413, detail="Command output exceeds 1 MB limit")
    exit_code = payload.get("exit_code", 0)
    if isinstance(exit_code, bool) or not isinstance(exit_code, int):
        raise HTTPException(status_code=422, detail="exit_code must be an integer")
    if output:
        await result_queue.put({"type": "output", "chunk": output})
    await result_queue.put({"type": "done", "exit_code": exit_code})
    return {"status": "ok"}


# ── REST alternative (for clients that can't use WebSocket) ───────────────────


@router.post("/run/{agent_id}")
async def run_command_sync(
    agent_id: str,
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Submit a command synchronously — blocks until the agent replies or times out."""
    if current_user.role not in ("admin", "operator"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    try:
        cmd, timeout_sec = _validate_command(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not await get_device(db, agent_id):
        raise HTTPException(status_code=404, detail="Agent not found")
    command_id = f"CMD-{uuid4().hex[:12].upper()}"

    await record_event(
        db,
        event_type="agent.command.submitted",
        actor_type="user",
        actor_id=current_user.username,
        source="api",
        action="run_command",
        target_type="agent",
        target_id=agent_id,
        status="queued",
        message=cmd[:500],
        metadata={"command_id": command_id},
    )
    await db.commit()

    result_queue: asyncio.Queue = asyncio.Queue()

    async with _pending_lock:
        _pending.setdefault(agent_id, []).append(
            {
                "command_id": command_id,
                "cmd": cmd,
                "timeout_sec": timeout_sec,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "expires_at": time.time() + timeout_sec + 30,
            }
        )
        _ws_queues[command_id] = result_queue
        _command_agents[command_id] = agent_id

    deadline = time.monotonic() + timeout_sec + 30
    output_parts: list[str] = []
    exit_code = -1
    try:
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise HTTPException(status_code=504, detail="Command timed out waiting for agent")
            try:
                chunk = await asyncio.wait_for(result_queue.get(), timeout=min(remaining, 2.0))
            except asyncio.TimeoutError:
                continue
            if chunk.get("type") == "output":
                output_parts.append(chunk["chunk"])
            elif chunk.get("type") == "done":
                exit_code = chunk.get("exit_code", 0)
                break
            elif chunk.get("type") == "error":
                raise HTTPException(status_code=502, detail=chunk.get("message", "Agent error"))
    finally:
        async with _pending_lock:
            remaining_commands = [
                entry for entry in _pending.get(agent_id, []) if entry["command_id"] != command_id
            ]
            if remaining_commands:
                _pending[agent_id] = remaining_commands
            else:
                _pending.pop(agent_id, None)
            _ws_queues.pop(command_id, None)
            _command_agents.pop(command_id, None)

    return {
        "command_id": command_id,
        "agent_id": agent_id,
        "cmd": cmd,
        "output": "".join(output_parts),
        "exit_code": exit_code,
    }

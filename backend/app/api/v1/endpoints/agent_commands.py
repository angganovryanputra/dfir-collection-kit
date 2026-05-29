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
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect

from app.core.deps import get_current_user
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()

# ── In-memory command queues ───────────────────────────────────────────────────
# _pending: agent_id → list of command dicts waiting to be picked up by the agent
# _ws_queues: command_id → asyncio.Queue receiving chunks from the agent
_pending: dict[str, list[dict]] = {}
_ws_queues: dict[str, asyncio.Queue] = {}
_pending_lock = asyncio.Lock()

# Maximum allowed command timeout (seconds)
_MAX_TIMEOUT_SEC = 300


# ── Analyst WebSocket endpoint ────────────────────────────────────────────────

@router.websocket("/ws/{agent_id}")
async def analyst_ws(
    agent_id: str,
    websocket: WebSocket,
    token: str = Query(..., description="Bearer JWT — sent as ?token=... (WS can't set headers)"),
) -> None:
    """Stream live command output to an analyst."""
    from app.core.security import decode_access_token, is_token_revoked
    from jwt import InvalidTokenError

    try:
        payload = decode_access_token(token)
        jti = payload.get("jti")
        if jti and is_token_revoked(jti):
            await websocket.close(code=4001, reason="Token revoked")
            return
        if payload.get("role", "viewer") not in ("admin", "operator"):
            await websocket.close(code=4003, reason="Insufficient permissions")
            return
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

            cmd = msg.get("cmd", "").strip()
            timeout_sec = min(int(msg.get("timeout_sec", 30)), _MAX_TIMEOUT_SEC)
            if not cmd:
                await websocket.send_text(json.dumps({"type": "error", "message": "cmd is required"}))
                continue

            command_id = f"CMD-{uuid4().hex[:12].upper()}"
            result_queue: asyncio.Queue = asyncio.Queue()

            async with _pending_lock:
                _pending.setdefault(agent_id, []).append({
                    "command_id": command_id,
                    "cmd": cmd,
                    "timeout_sec": timeout_sec,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
                _ws_queues[command_id] = result_queue

            await websocket.send_text(json.dumps({
                "type": "queued",
                "command_id": command_id,
                "message": f"Queued — waiting for agent {agent_id}",
            }))

            deadline = time.monotonic() + timeout_sec + 30
            try:
                while True:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        await websocket.send_text(json.dumps({
                            "type": "error",
                            "message": "Timed out waiting for agent response",
                        }))
                        break
                    try:
                        chunk = await asyncio.wait_for(result_queue.get(), timeout=min(remaining, 5.0))
                    except asyncio.TimeoutError:
                        await websocket.send_text(json.dumps({"type": "ping"}))
                        continue
                    await websocket.send_text(json.dumps(chunk))
                    if chunk.get("type") in ("done", "error"):
                        break
            finally:
                async with _pending_lock:
                    _ws_queues.pop(command_id, None)
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
async def poll_for_command(agent_id: str) -> dict:
    """Agent calls this endpoint periodically to check for pending commands."""
    async with _pending_lock:
        queue = _pending.get(agent_id, [])
        if not queue:
            return {}
        entry = queue.pop(0)
    return {
        "command_id": entry["command_id"],
        "cmd": entry["cmd"],
        "timeout_sec": entry["timeout_sec"],
    }


@router.post("/result/{command_id}")
async def post_command_result(command_id: str, payload: dict) -> dict:
    """Agent posts execution output back to the waiting analyst WebSocket."""
    result_queue = _ws_queues.get(command_id)
    if result_queue is None:
        return {"status": "no_subscriber"}

    output = payload.get("output", "")
    exit_code = int(payload.get("exit_code", 0))
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
) -> dict:
    """Submit a command synchronously — blocks until the agent replies or times out."""
    if current_user.role not in ("admin", "operator"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    cmd = payload.get("cmd", "").strip()
    timeout_sec = min(int(payload.get("timeout_sec", 30)), _MAX_TIMEOUT_SEC)
    if not cmd:
        raise HTTPException(status_code=422, detail="cmd is required")

    command_id = f"CMD-{uuid4().hex[:12].upper()}"
    result_queue: asyncio.Queue = asyncio.Queue()

    async with _pending_lock:
        _pending.setdefault(agent_id, []).append({
            "command_id": command_id,
            "cmd": cmd,
            "timeout_sec": timeout_sec,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        _ws_queues[command_id] = result_queue

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
            _ws_queues.pop(command_id, None)

    return {
        "command_id": command_id,
        "agent_id": agent_id,
        "cmd": cmd,
        "output": "".join(output_parts),
        "exit_code": exit_code,
    }

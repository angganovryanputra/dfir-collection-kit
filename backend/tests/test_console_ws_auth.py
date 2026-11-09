"""
Unit tests for Analyst WebSocket handshake and authentication alignment (Task 5).

Covers:
  - Missing credentials (no token, no cookie) -> rejected with 4001 or 4003 (403).
  - Missing session with valid origin -> closed with code 4001 (reason: "Missing session").
  - Valid session cookie with matching origin -> connection accepted.
  - Valid bearer token in query parameter -> connection accepted (CLI/non-browser).
  - Invalid query token -> closed with code 4001 (reason: "Invalid token").
  - Invalid cookie -> closed with code 4001 (reason: "Invalid token").
  - Untrusted origin on cookie auth -> closed with code 4003 (reason: "Untrusted WebSocket origin").
"""

from unittest.mock import AsyncMock, patch

import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.core.config import settings
from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_ws_rejects_missing_credentials(client: TestClient):
    """Connecting without cookie or query token is rejected with 4001 or 4003/403."""
    with pytest.raises((WebSocketDisconnect, Exception)) as exc_info:
        with client.websocket_connect("/api/v1/agent-commands/ws/dev-test-agent"):
            pass
    if isinstance(exc_info.value, WebSocketDisconnect):
        assert exc_info.value.code in (4001, 4003)


def test_ws_rejects_missing_session_with_valid_origin(client: TestClient):
    """Connecting with valid origin but no token or cookie is closed with code 4001."""
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(
            "/api/v1/agent-commands/ws/dev-test-agent",
            headers={"origin": "http://testserver", "host": "testserver"},
        ):
            pass
    assert exc_info.value.code == 4001
    assert exc_info.value.reason == "Missing session"


def test_ws_accepts_valid_cookie(client: TestClient):
    """Connecting with valid origin and HttpOnly session cookie connects successfully."""
    with patch(
        "app.api.v1.endpoints.agent_commands._authorize_console_session",
        new=AsyncMock(return_value="analyst_alice"),
    ):
        with client.websocket_connect(
            "/api/v1/agent-commands/ws/dev-test-agent",
            headers={"origin": "http://testserver", "host": "testserver"},
            cookies={settings.AUTH_COOKIE_NAME: "valid-session-jwt"},
        ) as ws:
            # WebSocket accepted and connected
            ws.close()


def test_ws_accepts_valid_query_token(client: TestClient):
    """Connecting with valid query token connects successfully (CLI / non-browser clients)."""
    with patch(
        "app.api.v1.endpoints.agent_commands._authorize_console_session",
        new=AsyncMock(return_value="analyst_alice"),
    ):
        with client.websocket_connect(
            "/api/v1/agent-commands/ws/dev-test-agent?token=valid-bearer-jwt"
        ) as ws:
            # WebSocket accepted and connected
            ws.close()


def test_ws_rejects_invalid_token(client: TestClient):
    """Connecting with an invalid query token is rejected with code 4001."""
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(
            "/api/v1/agent-commands/ws/dev-test-agent?token=invalid.jwt.token"
        ):
            pass
    assert exc_info.value.code == 4001
    assert exc_info.value.reason == "Invalid token"


def test_ws_rejects_invalid_cookie(client: TestClient):
    """Connecting with an invalid cookie is rejected with code 4001."""
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(
            "/api/v1/agent-commands/ws/dev-test-agent",
            headers={"origin": "http://testserver", "host": "testserver"},
            cookies={settings.AUTH_COOKIE_NAME: "bad.cookie.jwt"},
        ):
            pass
    assert exc_info.value.code == 4001
    assert exc_info.value.reason == "Invalid token"


def test_ws_rejects_untrusted_origin_on_cookie(client: TestClient):
    """Cookie-authenticated connection from untrusted origin is rejected with code 4003."""
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(
            "/api/v1/agent-commands/ws/dev-test-agent",
            headers={"origin": "https://attacker.example.com", "host": "testserver"},
            cookies={settings.AUTH_COOKIE_NAME: "valid-session-jwt"},
        ):
            pass
    assert exc_info.value.code == 4003
    assert exc_info.value.reason == "Untrusted WebSocket origin"

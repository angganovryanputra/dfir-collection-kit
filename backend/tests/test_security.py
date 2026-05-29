"""
Security hardening unit tests:
  - JWT revocation (revoke_token, is_token_revoked, jti in tokens)
  - HMAC webhook signing (_sign_payload)
  - MODULE_REGISTRY integrity (keys, OS values, estimated sizes)
  - normalize_os_name
  - Incident state machine (_VALID_TRANSITIONS)
  - Cron expression validation
  - DuckDB SQL blocklist
"""
import pytest
import time


# ── JWT Revocation ──────────────────────────────────────────────────────────

def test_revoke_and_check_token():
    from app.core.security import revoke_token, is_token_revoked
    jti = "test-jti-sec-001"
    exp = time.time() + 3600
    assert not is_token_revoked(jti)
    revoke_token(jti, exp)
    assert is_token_revoked(jti)


def test_expired_token_not_in_revocation_list():
    from app.core.security import revoke_token, is_token_revoked
    jti = "test-jti-sec-expired"
    exp = time.time() - 1  # already expired
    revoke_token(jti, exp)
    assert not is_token_revoked(jti), "Expired tokens should be auto-cleaned"


def test_access_token_has_jti():
    from app.core.security import create_access_token, decode_access_token
    token, _ = create_access_token("testuser")
    payload = decode_access_token(token)
    assert "jti" in payload, "Access token must include jti claim"
    assert len(payload["jti"]) == 32, "jti should be 32-char hex UUID"


# ── HMAC Webhook Signing ─────────────────────────────────────────────────────

def test_sign_payload_format():
    from app.services.notification_service import _sign_payload
    sig = _sign_payload(b'{"event":"test"}', "secret")
    assert sig.startswith("sha256=")
    assert len(sig) == 71  # "sha256=" (7) + 64 hex chars


def test_sign_payload_deterministic():
    from app.services.notification_service import _sign_payload
    body = b'{"event":"pipeline_complete"}'
    assert _sign_payload(body, "k1") == _sign_payload(body, "k1")


def test_sign_payload_key_sensitive():
    from app.services.notification_service import _sign_payload
    body = b'data'
    assert _sign_payload(body, "key1") != _sign_payload(body, "key2")


# ── MODULE_REGISTRY Integrity ────────────────────────────────────────────────

def test_module_ids_are_lowercase_snake_case():
    import re
    from app.core.modules import MODULE_REGISTRY
    pat = re.compile(r"^[a-z][a-z0-9_]+$")
    for key in MODULE_REGISTRY:
        assert pat.match(key), f"Module ID '{key}' must be lowercase_snake_case"


def test_module_os_values():
    from app.core.modules import MODULE_REGISTRY
    for key, entry in MODULE_REGISTRY.items():
        assert entry["os"] in ("windows", "linux", "macos"), f"{key}: invalid os"


def test_module_sizes_present_for_non_macos():
    from app.core.modules import MODULE_REGISTRY, _MODULE_SIZES
    for key in MODULE_REGISTRY:
        if not key.startswith("macos_"):
            assert key in _MODULE_SIZES, f"Module {key} missing from _MODULE_SIZES"


def test_normalize_os_name():
    from app.core.modules import normalize_os_name
    assert normalize_os_name("darwin") == "macos"
    assert normalize_os_name("Darwin") == "macos"
    assert normalize_os_name("Mac OS X") == "macos"
    assert normalize_os_name("osx") == "macos"
    assert normalize_os_name("windows") == "windows"
    assert normalize_os_name("linux") == "linux"
    assert normalize_os_name(None) is None


# ── Incident State Machine ───────────────────────────────────────────────────

def test_valid_transitions_exist():
    from app.api.v1.endpoints.incidents import _VALID_TRANSITIONS
    assert "ACTIVE" in _VALID_TRANSITIONS["PENDING"]
    assert "COLLECTION_IN_PROGRESS" in _VALID_TRANSITIONS["ACTIVE"]
    assert "COLLECTION_COMPLETE" in _VALID_TRANSITIONS["COLLECTION_IN_PROGRESS"]


def test_closed_is_terminal():
    from app.api.v1.endpoints.incidents import _VALID_TRANSITIONS
    assert len(_VALID_TRANSITIONS.get("CLOSED", set())) == 0


# ── Cron Expression Validation ───────────────────────────────────────────────

def test_valid_cron():
    from app.api.v1.endpoints.platform_features import _CRON_RE
    for expr in ["0 2 * * *", "*/15 * * * *", "0 2 * * 1", "0 2 1 * *"]:
        assert _CRON_RE.match(expr), f"Should be valid: {expr}"


def test_invalid_cron():
    from app.api.v1.endpoints.platform_features import _CRON_RE
    for expr in ["* * * *", "invalid cron", "* * * * * *"]:
        assert not _CRON_RE.match(expr), f"Should be invalid: {expr}"


# ── DuckDB SQL Blocklist ──────────────────────────────────────────────────────

def test_dangerous_sql_blocked():
    from app.api.v1.endpoints.platform_features import _validate_hunt_query_sql
    for sql in [
        "ATTACH '/etc/passwd' AS leak",
        "SELECT * FROM read_csv('/etc/shadow')",
        "COPY events TO '/tmp/exfil.csv'",
        "DROP TABLE events",
        "CREATE TABLE evil AS SELECT 1",
        "INSERT INTO events VALUES (1, 2)",
    ]:
        with pytest.raises(ValueError, match="blocked"):
            _validate_hunt_query_sql(sql)


def test_safe_sql_allowed():
    from app.api.v1.endpoints.platform_features import _validate_hunt_query_sql
    for sql in [
        "SELECT * FROM events WHERE message ILIKE '%mimikatz%' LIMIT 100",
        "SELECT host, COUNT(*) FROM events GROUP BY host",
        "SELECT datetime, source FROM events ORDER BY datetime LIMIT 50",
    ]:
        _validate_hunt_query_sql(sql)  # must not raise


# ── URL Validation in SIEMExportRequest ──────────────────────────────────────

def test_siem_url_validation():
    from pydantic import ValidationError
    from app.api.v1.endpoints.platform_features import SIEMExportRequest

    with pytest.raises(ValidationError):
        SIEMExportRequest(target="splunk", incident_id="INC-001",
                          splunk_hec_url="not-a-url", splunk_hec_token="token")


def test_siem_valid_request():
    from app.api.v1.endpoints.platform_features import SIEMExportRequest
    req = SIEMExportRequest(target="splunk", incident_id="INC-001",
                             splunk_hec_url="https://splunk:8088", splunk_hec_token="t")
    assert req.target == "splunk"


def test_elastic_index_validation():
    from pydantic import ValidationError
    from app.api.v1.endpoints.platform_features import SIEMExportRequest

    with pytest.raises(ValidationError):
        SIEMExportRequest(target="elastic", incident_id="INC-001",
                          elastic_url="http://es:9200", elastic_index="INVALID INDEX")

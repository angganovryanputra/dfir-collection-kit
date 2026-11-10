"""
Unit tests for Threat Intel 24-hr caching layer (Redis + in-memory fallback).

Validates:
- Cache miss invokes external enrichment and caches result.
- Cache hit returns cached EnrichResult without re-invoking network provider.
- Case-insensitivity and whitespace normalization on IOC keys.
- In-memory cache TTL expiration.
- Cache invalidation via clear_threat_intel_cache().
- Redis caching with 24-hour (86400s) TTL.
- Seamless fallback to in-memory cache when Redis is unavailable or fails.
- Multiple services (VirusTotal, MISP) caching independently.
"""

from __future__ import annotations

import fnmatch
import time
from unittest.mock import AsyncMock, patch

import pytest

from app.api.v1.endpoints import threat_intel
from app.api.v1.endpoints.threat_intel import (
    THREAT_INTEL_CACHE_TTL,
    EnrichRequest,
    EnrichResult,
    _memory_cache,
    _memory_cache_lock,
    _threat_intel_cache_key,
    clear_threat_intel_cache,
    enrich_hash,
    enrich_ioc,
)
from app.models.user import User


class MockRedis:
    """Mock Redis client for testing caching, TTL, and error handling."""

    def __init__(self) -> None:
        self.data: dict[str, str] = {}
        self.ttls: dict[str, int] = {}
        self.get_calls = 0
        self.set_calls = 0
        self.delete_calls = 0

    async def ping(self) -> bool:
        return True

    async def get(self, key: str) -> str | None:
        self.get_calls += 1
        return self.data.get(key)

    async def setex(self, key: str, ttl: int, value: str) -> bool:
        self.set_calls += 1
        self.data[key] = value
        self.ttls[key] = ttl
        return True

    async def set(self, key: str, value: str, ex: int | None = None) -> bool:
        self.set_calls += 1
        self.data[key] = value
        if ex is not None:
            self.ttls[key] = ex
        return True

    async def keys(self, pattern: str = "*") -> list[str]:
        return [k for k in self.data.keys() if fnmatch.fnmatch(k, pattern)]

    async def delete(self, *keys: str) -> int:
        self.delete_calls += 1
        count = 0
        for k in keys:
            if k in self.data:
                del self.data[k]
                self.ttls.pop(k, None)
                count += 1
        return count


class FailingRedis(MockRedis):
    """Mock Redis client that simulates connection drops."""

    async def get(self, key: str) -> str | None:
        raise ConnectionError("Redis server unreachable")

    async def setex(self, key: str, ttl: int, value: str) -> bool:
        raise ConnectionError("Redis server unreachable")


@pytest.fixture(autouse=True)
async def cleanup_cache():
    """Ensure caches and Redis client are reset around every test."""
    threat_intel._redis_client = None
    clear_threat_intel_cache()
    yield
    threat_intel._redis_client = None
    clear_threat_intel_cache()


@pytest.fixture
def dummy_user():
    return User(
        id="usr_test",
        username="test_operator",
        role="operator",
        status="active",
        password_hash="pw",
    )


def test_cache_key_generation():
    key = _threat_intel_cache_key("virustotal", "hash", "  44D88612FEA8A8F36DE82E1278ABB02F  ")
    assert key == "threat_intel:virustotal:hash:44d88612fea8a8f36de82e1278abb02f"


@pytest.mark.asyncio
async def test_in_memory_cache_miss_and_hit(dummy_user):
    mock_vt = AsyncMock(
        return_value=EnrichResult(
            ioc_type="hash",
            ioc_value="44d88612fea8a8f36de82e1278abb02f",
            service="virustotal",
            found=True,
            score=85,
            labels=["trojan"],
            permalink="https://virustotal.com/gui/file/test",
            raw={"malicious": 85},
            error=None,
        )
    )

    req = EnrichRequest(
        ioc_type="hash",
        ioc_value="44d88612fea8a8f36de82e1278abb02f",
        services=["virustotal"],
    )

    with patch("app.api.v1.endpoints.threat_intel._vt_enrich", mock_vt):
        # 1. First call: Cache miss -> calls _vt_enrich
        res1 = await enrich_ioc(req, dummy_user)
        assert len(res1) == 1
        assert res1[0].found is True
        assert res1[0].score == 85
        assert mock_vt.call_count == 1

        # 2. Second call: Cache hit -> does NOT call _vt_enrich
        res2 = await enrich_ioc(req, dummy_user)
        assert len(res2) == 1
        assert res2[0].found is True
        assert res2[0].score == 85
        assert mock_vt.call_count == 1  # Still 1!


@pytest.mark.asyncio
async def test_cache_key_normalization_hit(dummy_user):
    mock_vt = AsyncMock(
        return_value=EnrichResult(
            ioc_type="hash",
            ioc_value="44d88612fea8a8f36de82e1278abb02f",
            service="virustotal",
            found=True,
            score=90,
        )
    )

    with patch("app.api.v1.endpoints.threat_intel._vt_enrich", mock_vt):
        # Store with lowercase
        await enrich_ioc(
            EnrichRequest(ioc_type="hash", ioc_value="44d88612fea8a8f36de82e1278abb02f"),
            dummy_user,
        )
        assert mock_vt.call_count == 1

        # Lookup with uppercase and spaces -> should hit cache
        await enrich_ioc(
            EnrichRequest(
                ioc_type="hash", ioc_value="  44D88612FEA8A8F36DE82E1278ABB02F  "
            ),
            dummy_user,
        )
        assert mock_vt.call_count == 1


@pytest.mark.asyncio
async def test_in_memory_cache_ttl_expiration(dummy_user):
    mock_vt = AsyncMock(
        return_value=EnrichResult(
            ioc_type="ip",
            ioc_value="192.168.1.100",
            service="virustotal",
            found=True,
            score=10,
        )
    )

    req = EnrichRequest(ioc_type="ip", ioc_value="192.168.1.100", services=["virustotal"])

    with patch("app.api.v1.endpoints.threat_intel._vt_enrich", mock_vt):
        await enrich_ioc(req, dummy_user)
        assert mock_vt.call_count == 1

        # Manually backdate expiration timestamp for testing TTL
        key = _threat_intel_cache_key("virustotal", "ip", "192.168.1.100")
        with _memory_cache_lock:
            expires_at, data = _memory_cache[key]
            _memory_cache[key] = (time.time() - 1.0, data)

        # Call again after expiration -> should re-fetch
        await enrich_ioc(req, dummy_user)
        assert mock_vt.call_count == 2


@pytest.mark.asyncio
async def test_clear_threat_intel_cache(dummy_user):
    mock_vt = AsyncMock(
        return_value=EnrichResult(
            ioc_type="domain",
            ioc_value="evil-domain.com",
            service="virustotal",
            found=True,
        )
    )

    req = EnrichRequest(
        ioc_type="domain", ioc_value="evil-domain.com", services=["virustotal"]
    )

    with patch("app.api.v1.endpoints.threat_intel._vt_enrich", mock_vt):
        await enrich_ioc(req, dummy_user)
        assert mock_vt.call_count == 1

        # Invalidate cache
        await clear_threat_intel_cache()

        # Should fetch again
        await enrich_ioc(req, dummy_user)
        assert mock_vt.call_count == 2


@pytest.mark.asyncio
async def test_redis_caching_and_ttl(dummy_user):
    mock_redis = MockRedis()
    threat_intel._redis_client = mock_redis

    mock_vt = AsyncMock(
        return_value=EnrichResult(
            ioc_type="hash",
            ioc_value="11112222333344445555666677778888",
            service="virustotal",
            found=True,
            score=70,
        )
    )

    req = EnrichRequest(
        ioc_type="hash",
        ioc_value="11112222333344445555666677778888",
        services=["virustotal"],
    )

    with patch("app.api.v1.endpoints.threat_intel._vt_enrich", mock_vt):
        # 1. Fetch & Store into Redis
        res1 = await enrich_ioc(req, dummy_user)
        assert mock_vt.call_count == 1
        assert mock_redis.set_calls == 1

        expected_key = "threat_intel:virustotal:hash:11112222333344445555666677778888"
        assert expected_key in mock_redis.data
        assert mock_redis.ttls[expected_key] == THREAT_INTEL_CACHE_TTL

        # 2. Clear in-memory cache to force reading from Redis
        with _memory_cache_lock:
            _memory_cache.clear()

        # 3. Subsequent request should hit Redis
        res2 = await enrich_ioc(req, dummy_user)
        assert mock_vt.call_count == 1  # No new network call
        assert mock_redis.get_calls >= 1
        assert res2[0].score == 70


@pytest.mark.asyncio
async def test_redis_unavailable_fallback(dummy_user):
    failing_redis = FailingRedis()
    threat_intel._redis_client = failing_redis

    mock_vt = AsyncMock(
        return_value=EnrichResult(
            ioc_type="ip",
            ioc_value="8.8.8.8",
            service="virustotal",
            found=True,
            score=0,
        )
    )

    req = EnrichRequest(ioc_type="ip", ioc_value="8.8.8.8", services=["virustotal"])

    with patch("app.api.v1.endpoints.threat_intel._vt_enrich", mock_vt):
        # Even if Redis fails, the call completes gracefully using in-memory cache
        res1 = await enrich_ioc(req, dummy_user)
        assert res1[0].found is True
        assert mock_vt.call_count == 1

        # Second call hits in-memory fallback without raising error
        res2 = await enrich_ioc(req, dummy_user)
        assert res2[0].found is True
        assert mock_vt.call_count == 1


@pytest.mark.asyncio
async def test_clear_threat_intel_cache_cleans_redis_and_memory(dummy_user):
    mock_redis = MockRedis()
    threat_intel._redis_client = mock_redis

    mock_vt = AsyncMock(
        return_value=EnrichResult(
            ioc_type="ip",
            ioc_value="1.1.1.1",
            service="virustotal",
            found=True,
        )
    )

    with patch("app.api.v1.endpoints.threat_intel._vt_enrich", mock_vt):
        await enrich_ioc(
            EnrichRequest(ioc_type="ip", ioc_value="1.1.1.1", services=["virustotal"]),
            dummy_user,
        )

    expected_key = "threat_intel:virustotal:ip:1.1.1.1"
    assert expected_key in mock_redis.data
    assert len(_memory_cache) == 1

    await clear_threat_intel_cache()

    assert expected_key not in mock_redis.data
    assert len(_memory_cache) == 0


@pytest.mark.asyncio
async def test_multiple_services_independent_caching(dummy_user):
    mock_vt = AsyncMock(
        return_value=EnrichResult(
            ioc_type="hash",
            ioc_value="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            service="virustotal",
            found=True,
            score=50,
        )
    )
    mock_misp = AsyncMock(
        return_value=EnrichResult(
            ioc_type="hash",
            ioc_value="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            service="misp",
            found=True,
            score=30,
        )
    )

    req = EnrichRequest(
        ioc_type="hash",
        ioc_value="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        services=["virustotal", "misp"],
    )

    with (
        patch("app.api.v1.endpoints.threat_intel._vt_enrich", mock_vt),
        patch("app.api.v1.endpoints.threat_intel._misp_enrich", mock_misp),
    ):
        res = await enrich_ioc(req, dummy_user)
        assert len(res) == 2
        assert mock_vt.call_count == 1
        assert mock_misp.call_count == 1

        # Second call requesting only MISP: only MISP result returned from cache
        misp_req = EnrichRequest(
            ioc_type="hash",
            ioc_value="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            services=["misp"],
        )
        res_misp = await enrich_ioc(misp_req, dummy_user)
        assert len(res_misp) == 1
        assert res_misp[0].service == "misp"
        assert res_misp[0].score == 30
        assert mock_vt.call_count == 1
        assert mock_misp.call_count == 1


@pytest.mark.asyncio
async def test_enrich_hash_convenience_endpoint(dummy_user):
    mock_vt = AsyncMock(
        return_value=EnrichResult(
            ioc_type="hash",
            ioc_value="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            service="virustotal",
            found=True,
            score=100,
        )
    )

    with patch("app.api.v1.endpoints.threat_intel._vt_enrich", mock_vt):
        # Call convenience endpoint
        res1 = await enrich_hash("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", dummy_user)
        assert mock_vt.call_count == 1

        # Next call uses cache
        res2 = await enrich_hash("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", dummy_user)
        assert mock_vt.call_count == 1
        assert res2[0].score == 100

from datetime import datetime, timezone

import pytest

from app.schemas.collector import CollectorCreate
from app.schemas.device import DeviceCreate


def test_device_create_accepts_agent_payload():
    payload = {
        "id": "agent-test-123",
        "hostname": "DC01",
        "ip_address": "192.168.1.10",
        "type": "server",
        "os": "windows",
        "agent_version": "1.0.0",
        "status": "ONLINE",
    }
    device = DeviceCreate(**payload)
    assert device.id == "agent-test-123"
    assert device.collection_status == "IDLE"
    assert isinstance(device.last_seen, datetime)
    assert isinstance(device.registered_at, datetime)


def test_collector_create_accepts_minimal_payload():
    payload = {
        "name": "Collector Node 01",
        "endpoint": "http://192.168.1.200:8080",
    }
    collector = CollectorCreate(**payload)
    assert collector.name == "Collector Node 01"
    assert collector.status == "ONLINE"
    assert collector.id.startswith("COL-")
    assert isinstance(collector.last_heartbeat, datetime)

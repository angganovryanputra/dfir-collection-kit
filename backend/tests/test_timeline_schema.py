from app.services.timeline_schema import UnifiedEvent


def test_normalization_preserves_raw_data_and_common_aliases():
    event = UnifiedEvent.from_timeline_entry(
        {
            "TimeCreated": "2026-09-14T12:00:00+07:00",
            "source_long": "Chrome history",
            "HostName": "WS-01",
            "EventId": 4688,
            "UserName": "alice",
            "CommandLine": "powershell.exe",
            "SHA256": "abc",
            "DestinationPort": "443",
        },
        "inc-1",
    )
    assert event.timestamp == "2026-09-14T05:00:00+00:00"
    assert event.host == "WS-01" and event.event_id == "4688"
    assert event.actor == "alice" and event.command_line == "powershell.exe"
    assert event.dest_port == 443
    assert event.hashes == {"sha256": "abc"}
    assert event.raw_data["TimeCreated"] == "2026-09-14T12:00:00+07:00"

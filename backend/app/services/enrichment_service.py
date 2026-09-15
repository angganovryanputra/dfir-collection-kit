"""Apply deterministic DFIR enrichment to canonical timeline events."""

from __future__ import annotations

from app.services.entity_extractor import extract_all_entities, extract_entities, is_private_ip
from app.services.timeline_schema import UnifiedEvent, get_mitre_mapping

_EVENT_TECHNIQUES = {
    "4624": ["T1078"],  # Valid Accounts
    "4625": ["T1110"],  # Brute Force
    "4688": ["T1059"],  # Command and Scripting Interpreter (generic)
    "4698": ["T1053.005"],
    "4728": ["T1098"],
    "4732": ["T1098"],
    "5140": ["T1021.002"],
    "1102": ["T1070.001"],
}


def enrich_event(event: UnifiedEvent) -> UnifiedEvent:
    """Enrich in place using local mappings only; no external data leaves evidence."""
    entities = extract_entities(event.raw_data | event.model_dump(exclude={"raw_data"}))
    message_entities = extract_all_entities(event.message)
    if not event.source_ip and entities["ips"]:
        event.source_ip = entities["ips"][0]
    if event.event_id:
        mapping = get_mitre_mapping(event.event_id)
        event.mitre_techniques = (
            [mapping["technique"]] if mapping else _EVENT_TECHNIQUES.get(str(event.event_id), [])
        )
        event.mitre_tactic = mapping.get("tactic") if mapping else None
        event.category = event.category or mapping.get("category") if mapping else event.category
    if not event.dest_ip and len(message_entities["ips"]) > 1:
        event.dest_ip = message_entities["ips"][1]
    if not event.actor and message_entities["users"]:
        event.actor = message_entities["users"][0]
    event.hashes = {**message_entities["hashes"], **event.hashes}
    score = (
        (3 if event.mitre_techniques else 0)
        + (
            3
            if str(event.event_id)
            in {"4625", "4697", "4698", "4720", "4728", "4732", "4756", "1102"}
            else 0
        )
        + (2 if event.source_short == "SIGMA" else 0)
        + (1 if event.dest_ip and not is_private_ip(event.dest_ip) else 0)
    )
    event.severity = event.severity or (
        "critical" if score >= 7 else "high" if score >= 5 else "medium" if score >= 3 else "low"
    )
    event.confidence = min(
        1.0,
        0.5
        + 0.2 * bool(event.event_id)
        + 0.1 * bool(event.mitre_techniques)
        + 0.1 * bool(event.actor)
        + 0.05 * bool(event.source_ip)
        + 0.05 * bool(event.hashes),
    )
    tags = set(event.tags)
    for entity_type, values in entities.items():
        if values:
            tags.add(f"has_{entity_type}")
    if event.mitre_techniques:
        tags.add("mitre_mapped")
        tags.add(f"mitre:{event.mitre_techniques[0]}")
    if event.source_short:
        tags.add(event.source_short.lower())
    if event.source_ip:
        tags.add("internal" if is_private_ip(event.source_ip) else "external")
    event.tags = sorted(tags)
    return event

# Artifact collection and normalization contract

Super Timeline uses a lossless canonical event boundary. Every parser may keep
native fields, but downstream views receive the same core fields: `timestamp`,
`source`, `source_short`, `host`, `event_id`, `message`, `actor`, `target`,
source/destination IPs, severity, process, hashes, ATT&CK metadata, `event_uid`,
and `raw_data`.

The original parser payload is retained under `raw_data` and exposed in the
event inspector. Unknown timestamps remain unknown; known timestamps are
offset-aware UTC ISO-8601 values. Common hash aliases, Windows Event IDs,
browser, Linux/macOS, network, and parser-specific fields are normalized while
the original spelling remains available for forensic review.

Interoperability mapping: Plaso/Timesketch fields map to `datetime`,
`source_short`, `timestamp_desc`, `message`, `host`, and `user`; ECS maps the
canonical timestamp to `@timestamp`, `event_id` to `event.code`, and
`event_uid` to `event.id`; Sigma metadata remains preserved in `raw_data`; STIX
2.1 exports should represent hashes/IPs/files as Cyber Observable Objects.

References: [Plaso output fields](https://plaso.readthedocs.io/en/latest/sources/user/Output-and-formatting.html), [ECS event fields](https://www.elastic.co/docs/reference/ecs/ecs-event), [ECS implementation principles](https://www.elastic.co/docs/reference/ecs/ecs-principles-implementation), [Microsoft Sysmon event schema](https://learn.microsoft.com/en-us/windows/security/operating-system-security/sysmon/sysmon-events), [Red Hat audit logging guidance](https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/8/pdf/security_hardening/security-hardening.pdf), [Apple unified logging](https://developer.apple.com/documentation/os/logging/), [OASIS STIX 2.1](https://www.oasis-open.org/standard/stix-version-2-1/).

"""Parameter-only filters shared by timeline browsing and exports."""

import shlex
from datetime import datetime, timezone

from fastapi import HTTPException


def utc_filter(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(422, "Use an ISO-8601 date/time") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).replace(tzinfo=None)


def timeline_where(
    q="", hosts=(), sources=(), date_from="", date_to="", users=(), event_ids=(), rules=()
):
    clauses, params = [], []
    fields = {
        "host": "host",
        "source": "source_short",
        "user": "COALESCE(extra->>'user', extra->>'actor', '')",
        "eid": "COALESCE(extra->>'event_id', '')",
        "rule": "COALESCE(extra->>'rule_name', '')",
    }

    def term(token):
        negative = token.startswith("-")
        if negative:
            token = token[1:]
        field, sep, value = token.partition(":")
        if sep and field.lower() in fields:
            expression = f"LOWER(COALESCE({fields[field.lower()]}, '')) LIKE ? ESCAPE '\\'"
            pattern = (
                value.lower()
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_")
                .replace("*", "%")
            )
            values = [pattern]
        else:
            pattern = (
                "%"
                + token.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
                + "%"
            )
            expression = (
                "("
                + " OR ".join(
                    f"LOWER(COALESCE({col}, '')) LIKE ? ESCAPE '\\'"
                    for col in ("message", "source", "timestamp_desc", "CAST(extra AS VARCHAR)")
                )
                + ")"
            )
            values = [pattern] * 4
        return (f"NOT ({expression})" if negative else expression), values

    if q.strip():
        try:
            lexer = shlex.shlex(q, posix=True)
            lexer.whitespace_split = True
            lexer.commenters = ""
            lexer.escape = ""  # Backslashes in Windows evidence paths are literal.
            tokens = list(lexer)
        except ValueError as exc:
            raise HTTPException(422, "Search contains an unclosed quote") from exc
        if len(tokens) > 100:
            raise HTTPException(422, "Search is limited to 100 terms")
        groups, group, negate, expect_term = [], [], False, True
        for token in tokens:
            if token.upper() in {"AND", "OR"}:
                if expect_term or negate:
                    raise HTTPException(422, "Search operator requires a term on both sides")
                if token.upper() == "OR":
                    groups.append(" AND ".join(group))
                    group = []
                expect_term = True
                continue
            if token.upper() == "NOT":
                negate = not negate
                expect_term = True
                continue
            expression, values = term(token)
            group.append(f"NOT ({expression})" if negate else expression)
            params.extend(values)
            negate, expect_term = False, False
        if expect_term:
            raise HTTPException(422, "Search must end with a term")
        groups.append(" AND ".join(group))
        clauses.append("(" + " OR ".join(f"({g})" for g in groups) + ")")

    for column, values in (
        ("host", hosts),
        ("UPPER(source_short)", sources),
        (fields["eid"], event_ids),
    ):
        if values:
            clauses.append(f"{column} IN ({','.join('?' for _ in values)})")
            params.extend(values)
    for column, values in ((fields["user"], users), (fields["rule"], rules)):
        if values:
            clauses.append("(" + " OR ".join(f"LOWER({column}) LIKE ?" for _ in values) + ")")
            params.extend("%" + value.lower().replace("*", "%") + "%" for value in values)
    start, end = utc_filter(date_from) if date_from else None, (
        utc_filter(date_to) if date_to else None
    )
    if start and end and start > end:
        raise HTTPException(422, "Start time must be before end time")
    if start:
        clauses.append("event_dt >= ?")
        params.append(start)
    if end:
        clauses.append("event_dt <= ?")
        params.append(end)
    return ("WHERE " + " AND ".join(clauses) if clauses else ""), params

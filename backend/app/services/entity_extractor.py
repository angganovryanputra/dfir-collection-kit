"""Small, dependency-free entity extractor for timeline enrichment."""

from __future__ import annotations

import ipaddress
import re
from typing import Any

_IP_RE = re.compile(
    r"(?<![\w.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\w.])"
)
_DOMAIN_RE = re.compile(
    r"(?<![\w.-])(?:[a-zA-Z0-9-]+\.)+(?:com|net|org|edu|gov|io|co|uk|id|local|internal)(?![\w.-])",
    re.I,
)
_HASH_RE = re.compile(r"\b[a-fA-F0-9]{32}(?:[a-fA-F0-9]{8})?(?:[a-fA-F0-9]{24})?\b")
_USER_RE = re.compile(r"(?:user(?:name)?|account|subject)\s*[:=]\s*([^\s,;]+)", re.I)
_IPV6_RE = re.compile(r"\b(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{1,4}\b", re.I)
_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
_PATH_RE = re.compile(r"[A-Z]:\\(?:[^\\/:*?\"<>|\r\n]+\\)*[^\\/:*?\"<>|\r\n]*", re.I)
_URL_RE = re.compile(r"https?://[^\s<>\"{}|\\^`\[\]]+", re.I)
_SID_RE = re.compile(r"\bS-1-5-21-\d+-\d+-\d+-\d+\b", re.I)


def extract_entities(record: dict[str, Any]) -> dict[str, list[str]]:
    """Extract conservative, display-safe observables from a timeline record."""
    message = " ".join(str(value) for value in record.values() if value is not None)
    entities = {
        "ips": sorted(set(_IP_RE.findall(message))),
        "domains": sorted(set(_DOMAIN_RE.findall(message))),
        "hashes": sorted(set(_HASH_RE.findall(message))),
        "users": sorted(set(_USER_RE.findall(message))),
    }
    for key in ("actor", "user", "username", "UserName", "TargetUserName"):
        value = record.get(key)
        if value not in (None, ""):
            entities["users"] = sorted(set(entities["users"]) | {str(value)})
    return entities


def is_private_ip(ip: str) -> bool:
    try:
        return ipaddress.ip_address(ip).is_private
    except ValueError:
        return False


def extract_all_entities(text: str) -> dict[str, Any]:
    """Return common DFIR observables in a structured, source-independent form."""
    if not text:
        return {
            "ips": [],
            "domains": [],
            "hashes": {},
            "file_paths": [],
            "urls": [],
            "emails": [],
            "users": [],
            "sids": [],
        }
    hashes = {
        "md5": next(iter(re.findall(r"\b[a-fA-F0-9]{32}\b", text)), ""),
        "sha1": next(iter(re.findall(r"\b[a-fA-F0-9]{40}\b", text)), ""),
        "sha256": next(iter(re.findall(r"\b[a-fA-F0-9]{64}\b", text)), ""),
    }
    return {
        "ips": sorted(set(_IP_RE.findall(text) + _IPV6_RE.findall(text))),
        "domains": sorted(set(_DOMAIN_RE.findall(text))),
        "hashes": {key: value for key, value in hashes.items() if value},
        "file_paths": sorted(set(_PATH_RE.findall(text))),
        "urls": sorted(set(_URL_RE.findall(text))),
        "emails": sorted(set(_EMAIL_RE.findall(text))),
        "users": sorted(set(_USER_RE.findall(text))),
        "sids": sorted(set(_SID_RE.findall(text))),
    }

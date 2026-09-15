"""Explicit adapters for Hayabusa JSONL and Chainsaw JSON output."""

import json
from pathlib import Path


def read_detection_output(path: Path) -> list[dict]:
    content = path.read_text(encoding="utf-8-sig").strip()
    if not content:
        return []
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        parsed = [json.loads(line) for line in content.splitlines() if line.strip()]
    if isinstance(parsed, dict):
        parsed = [parsed]
    if not isinstance(parsed, list) or any(not isinstance(hit, dict) for hit in parsed):
        raise ValueError("Detector output must contain JSON objects")
    return parsed


def normalize_hit(hit: dict) -> dict:
    if "RuleTitle" not in hit and "Timestamp" not in hit:
        return hit
    level = str(hit.get("Level", "informational")).lower()
    level = {"crit": "critical", "med": "medium", "info": "informational"}.get(level, level)
    details = hit.get("Details", {})
    doc = dict(details) if isinstance(details, dict) else {"Details": details}
    doc.update(
        {
            "Computer": hit.get("Computer"),
            "EventID": hit.get("EventID"),
            "EventRecordId": hit.get("RecordID"),
            "raw_hit": hit,
        }
    )
    tags = hit.get("MitreTags") or hit.get("Tags") or []
    if isinstance(tags, str):
        tags = [value.strip() for value in tags.split(",") if value.strip()]
    return {
        "name": hit.get("RuleTitle", "Unknown"),
        "rule_id": hit.get("RuleID"),
        "level": level,
        "timestamp": hit.get("Timestamp"),
        "document": doc,
        "description": hit.get("RuleTitle", ""),
        "tags": tags,
        "source": {"name": hit.get("EvtxFile", "")},
        "detector": "hayabusa",
    }


async def hayabusa(extracted_dir, sigma_dir, executable, runner):
    executable = str(Path(executable).resolve())
    ok, help_text = await runner([executable, "--help"], capture_stdout=True)
    if not ok:
        raise RuntimeError(f"Hayabusa preflight failed: {help_text}")
    if "dfir-timeline" in help_text:
        command, output_args = "dfir-timeline", ["--output-type", "jsonl"]
    elif "json-timeline" in help_text:
        command, output_args = "json-timeline", ["-L"]
    else:
        raise RuntimeError("Unsupported Hayabusa CLI; expected dfir-timeline or json-timeline")
    output = (sigma_dir / "hayabusa-output.jsonl").resolve()
    args = [
        executable,
        command,
        "-d",
        str(extracted_dir.resolve()),
        "-o",
        str(output),
        *output_args,
        "--no-wizard",
        "--no-color",
        "--quiet",
        "--ISO-8601",
        "--clobber",
    ]
    ok, error = await runner(args, cwd=str(Path(executable).parent))
    if not ok or not output.is_file():
        raise RuntimeError(f"Hayabusa failed or produced no output: {error}")
    return [normalize_hit(hit) for hit in read_detection_output(output)]


async def chainsaw(extracted_dir, sigma_dir, executable, rules_path, runner):
    rules = Path(rules_path)
    if (rules / "rules" / "windows").is_dir():
        rules = rules / "rules" / "windows"
    candidates = [
        Path(rules_path) / "tools" / "chainsaw" / "sigma-event-logs-all.yml",
        Path(rules_path) / "sigma-event-logs-all.yml",
        Path(executable).parent / "mappings" / "sigma-event-logs-all.yml",
    ]
    mapping = next((p for p in candidates if p.is_file()), None)
    if not mapping or not rules.is_dir():
        raise RuntimeError(
            "Chainsaw requires a rules directory and sigma-event-logs-all.yml mapping"
        )
    output = sigma_dir / "chainsaw-output.json"
    args = [
        executable,
        "hunt",
        str(extracted_dir),
        "--sigma",
        str(rules),
        "--mapping",
        str(mapping),
        "--json",
        "--output",
        str(output),
    ]
    ok, error = await runner(args)
    if not ok or not output.is_file():
        raise RuntimeError(f"Chainsaw failed or produced no output: {error}")
    return read_detection_output(output)

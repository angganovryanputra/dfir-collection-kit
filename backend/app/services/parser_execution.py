"""Bounded EZTools execution with per-input provenance and explicit coverage."""

import asyncio
from hashlib import sha256
from pathlib import Path


class ParserResults(dict):
    def __init__(self):
        super().__init__()
        self.stages = {}


async def execute_parsers(extracted_dir, parsed_dir, tools_path, cache, tool_dll, runner):
    results = ParserResults()
    registry = [p for p in cache.get_by_ext(".hve") if p.name.upper() != "AMCACHE.HVE"]
    for name in ("SYSTEM", "SOFTWARE", "SAM", "SECURITY", "DEFAULT", "NTUSER.DAT", "USRCLASS.DAT"):
        registry.extend(cache.get_by_name(name))
    plan = [
        ("EvtxECmd", "evtx", cache.get_by_ext(".evtx"), "-f"),
        ("MFTECmd", "mft", cache.get_by_name("MFT") + cache.get_by_name("$MFT"), "-f"),
        ("MFTECmd", "usnjrnl", cache.get_by_name("$J") + cache.get_by_name("$USNJRNL_$J"), "-f"),
        ("AmcacheParser", "amcache", cache.get_by_name("AMCACHE.HVE"), "-f"),
        ("RECmd", "registry", registry, "-f"),
        ("PECmd", "prefetch", sorted({p.parent for p in cache.get_by_ext(".pf")}), "-d"),
        ("LECmd", "lnk", sorted({p.parent for p in cache.get_by_ext(".lnk")}), "-d"),
        (
            "SBECmd",
            "shellbags",
            cache.get_by_name("NTUSER.DAT") + cache.get_by_name("USRCLASS.DAT"),
            "-f",
        ),
        (
            "JLECmd",
            "jumplists",
            cache.get_by_ext(".automaticdestinations-ms")
            + cache.get_by_ext(".customdestinations-ms"),
            "-f",
        ),
        ("SrumECmd", "srum", cache.get_by_name("SRUDB.DAT"), "-f"),
    ]
    semaphore = asyncio.Semaphore(4)

    async def execute(tool, source, inputs, flag):
        key = f"parser:{source}"
        unique_inputs = sorted(set(inputs))
        report = {"status": "SKIPPED", "inputs": len(unique_inputs), "succeeded": 0, "errors": []}
        results.stages[key] = report
        results[key] = 0
        if not unique_inputs:
            report["reason"] = "No applicable artifacts"
            return
        dll = tool_dll(tool, tools_path)
        if not dll:
            report.update(status="NOT_CONFIGURED", reason=f"{tool} DLL not available")
            return
        extra = []
        if tool == "RECmd":
            batch = Path(dll).parent / "BatchExamples" / "RECmd_Batch_MC.reb"
            if not batch.is_file():
                report.update(status="NOT_CONFIGURED", reason="RECmd_Batch_MC.reb is required")
                return
            extra = ["--bn", str(batch)]
        for path in unique_inputs:
            # Subdirectories isolate tools that emit several CSVs or choose
            # their own output name. No two input directories share an output.
            identity = sha256(path.relative_to(extracted_dir).as_posix().encode()).hexdigest()[:20]
            output = parsed_dir / source / identity
            output.mkdir(parents=True, exist_ok=True)
            command = ["dotnet", str(dll), flag, str(path), "--csv", str(output), *extra]
            async with semaphore:
                ok, error = await runner(command)
            if ok and any(output.rglob("*.csv")):
                report["succeeded"] += 1
            else:
                report["errors"].append(
                    {
                        "artifact": path.relative_to(extracted_dir).as_posix(),
                        "error": error or "Parser produced no CSV output",
                    }
                )
        report["status"] = "FAILED" if report["errors"] else "SUCCESS"
        results[key] = report["succeeded"]

    await asyncio.gather(*(execute(*job) for job in plan))
    return results

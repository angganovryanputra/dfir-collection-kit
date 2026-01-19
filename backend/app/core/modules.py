MODULE_REGISTRY = {
    "memory_dump": {
        "output_relpath": "volatile/memory_dump.raw",
        "params": {},
    },
    "process_list": {
        "output_relpath": "volatile/process_list.txt",
        "params": {},
    },
    "network_connections": {
        "output_relpath": "volatile/network_connections.txt",
        "params": {},
    },
    "event_logs": {
        "output_relpath": "logs/windows_event_logs.evtx",
        "params": {},
    },
}


def build_modules(module_ids: list[str] | None = None) -> list[dict]:
    if not module_ids:
        module_ids = list(MODULE_REGISTRY.keys())
    modules: list[dict] = []
    for module_id in module_ids:
        if module_id not in MODULE_REGISTRY:
            raise ValueError(f"Unknown module_id: {module_id}")
        entry = MODULE_REGISTRY[module_id]
        modules.append(
            {
                "module_id": module_id,
                "output_relpath": entry["output_relpath"],
                "params": entry["params"],
            }
        )
    return modules

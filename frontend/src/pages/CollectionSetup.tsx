import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TacticalPanel } from "@/components/TacticalPanel";
import { WarningBanner } from "@/components/WarningBanner";
import { StatusIndicator } from "@/components/StatusIndicator";
import { KeyValueRow } from "@/components/common/KeyValueRow";
import { Shield, Play, AlertTriangle, ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { apiGet } from "@/lib/api";
import { getStoredRole, isViewerRole } from "@/lib/auth";

type ModuleEntry = {
  id: string;
  os: string;
  category: string;
  priority: number;
  output_relpath: string;
  estimated_size_mb?: number;
};

type ModulesByCategory = Record<string, ModuleEntry[]>;

type ProfileSummary = {
  id: string;
  label: string;
  description: string;
  module_counts: Record<string, number>;
};

type IncidentSummary = {
  id: string;
  type: string;
  target_endpoints: string[];
};

type DeviceSummary = {
  id: string;
  hostname: string;
  os: string;
};

const CATEGORY_ORDER = ["volatile", "logs", "persistence", "system", "artifacts"];

const CATEGORY_LABELS: Record<string, string> = {
  volatile: "VOLATILE DATA",
  logs: "SYSTEM LOGS",
  persistence: "PERSISTENCE",
  system: "SYSTEM INFO",
  artifacts: "KAPE ARTIFACTS",
};

const CATEGORY_BADGE: Record<string, string> = {
  volatile: "text-destructive border-destructive",
  logs: "text-primary border-primary",
  persistence: "text-yellow-500 border-yellow-500",
  system: "text-muted-foreground border-muted-foreground",
  artifacts: "text-purple-400 border-purple-400",
};

const OS_OPTIONS = ["windows", "linux", "macos"] as const;
type SupportedOS = (typeof OS_OPTIONS)[number];

function normalizeOS(raw: string): SupportedOS {
  const s = raw.split("/")[0].toLowerCase().trim();
  if (["darwin", "macos", "mac os x", "mac os", "osx", "mac"].includes(s)) return "macos";
  if (s === "linux") return "linux";
  return "windows";
}

export default function CollectionSetup() {
  const navigate = useNavigate();
  const { id: incidentId } = useParams<{ id: string }>();

  const [incident, setIncident] = useState<IncidentSummary | null>(null);
  const [detectedOS, setDetectedOS] = useState<SupportedOS>("windows");
  const [osOverride, setOsOverride] = useState<SupportedOS | null>(null);
  const [modulesByCategory, setModulesByCategory] = useState<ModulesByCategory>({});
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeProfile, setActiveProfile] = useState<string | null>(null);

  const [moduleSearch, setModuleSearch] = useState("");
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Set<string>>(new Set());
  const isViewer = isViewerRole(getStoredRole());

  useEffect(() => {
    const load = async () => {
      if (!incidentId) {
        setErrorMessage("Missing incident identifier.");
        return;
      }
      try {
        const { items: incidents } = await apiGet<{ total: number; items: IncidentSummary[] }>("/incidents?limit=1000");
        const current = incidents.find((i) => i.id === incidentId) ?? null;
        setIncident(current);

        // Detect OS from first target endpoint
        let os: SupportedOS = "windows";
        if (current?.target_endpoints?.[0]) {
          const devices = await apiGet<DeviceSummary[]>("/devices");
          const target = current.target_endpoints[0].toLowerCase();
          const matched = devices.find((d) => d.hostname.toLowerCase() === target);
          if (matched?.os) {
            os = normalizeOS(matched.os);
          }
        }
        setDetectedOS(os);

        // Fetch modules and profiles in parallel
        const [modulesResp, profilesResp] = await Promise.all([
          apiGet<{ modules: ModulesByCategory }>(`/modules?os=${os}`),
          apiGet<{ profiles: ProfileSummary[] }>("/modules/profiles"),
        ]);

        setModulesByCategory(modulesResp.modules);
        setProfiles(profilesResp.profiles);

        // Fetch all registered devices and pre-select those matching incident targets
        const allDevices = await apiGet<DeviceSummary[]>("/devices");
        const targetSet = new Set(
          (current?.target_endpoints ?? []).map((h) => h.toLowerCase())
        );
        const relevantDevices = allDevices.filter(
          (d) => targetSet.has(d.hostname.toLowerCase())
        );
        setDevices(relevantDevices);
        setSelectedDeviceIds(new Set(relevantDevices.map((d) => d.id)));

        // Default: select all modules
        const allIds = new Set<string>();
        for (const entries of Object.values(modulesResp.modules)) {
          for (const m of entries) allIds.add(m.id);
        }
        setSelected(allIds);
        setActiveProfile("full");
      } catch {
        setErrorMessage("Unable to load collection modules.");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [incidentId]);

  // The effective OS is the user override (if any) or the auto-detected value
  const activeOS: SupportedOS = osOverride ?? detectedOS;

  const reloadModulesForOS = async (os: SupportedOS) => {
    setIsLoading(true);
    try {
      const resp = await apiGet<{ modules: ModulesByCategory }>(`/modules?os=${os}`);
      setModulesByCategory(resp.modules);
      const allIds = new Set<string>();
      for (const entries of Object.values(resp.modules)) {
        for (const m of entries) allIds.add(m.id);
      }
      setSelected(allIds);
      setActiveProfile("full");
    } catch {
      setErrorMessage("Unable to load modules for selected OS.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOsChange = (newOs: SupportedOS) => {
    if (isViewer) return;
    setOsOverride(newOs);
    reloadModulesForOS(newOs);
  };

  const allModuleIds = (): string[] => {
    const ids: string[] = [];
    for (const entries of Object.values(modulesByCategory)) {
      for (const m of entries) ids.push(m.id);
    }
    return ids;
  };

  const toggleModule = (id: string) => {
    if (isViewer) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setActiveProfile(null);
  };

  const selectCategory = (cat: string) => {
    if (isViewer) return;
    const catIds = (modulesByCategory[cat] ?? []).map((m) => m.id);
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of catIds) next.add(id);
      return next;
    });
    setActiveProfile(null);
  };

  const clearCategory = (cat: string) => {
    if (isViewer) return;
    const catIds = new Set((modulesByCategory[cat] ?? []).map((m) => m.id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of catIds) next.delete(id);
      return next;
    });
    setActiveProfile(null);
  };

  const applyProfile = async (profileId: string) => {
    if (isViewer) return;
    if (profileId === "full") {
      setActiveProfile(profileId);
      setSelected(new Set(allModuleIds()));
      return;
    }
    try {
      const resp = await apiGet<{ modules: ModuleEntry[] }>(
        `/modules/profiles/${profileId}?os=${activeOS}`
      );
      const profileIds = new Set(resp.modules.map((m) => m.id));
      // Only commit state changes after successful fetch
      setActiveProfile(profileId);
      setSelected(profileIds);
    } catch {
      setErrorMessage("Unable to load profile modules.");
    }
  };

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  const handleStartCollection = () => {
    if (isViewer || selected.size === 0) return;
    navigate(`/incidents/${incidentId}/collect`, {
      state: {
        selectedModuleIds: Array.from(selected),
        profile: activeProfile,
        // osOverride MUST be sent — CollectionExecution forwards it to the backend
        // so validate_modules_for_os() uses the correct OS. Without this, the
        // backend may reject selected modules (e.g. Linux modules against a Windows device).
        osOverride: activeOS,
        // agent_ids: explicitly targeted devices.
        // Only send when the user has deselected some devices, otherwise let
        // the backend resolve from incident.target_endpoints as usual.
        agentIds:
          devices.length > 0 && selectedDeviceIds.size < devices.length
            ? Array.from(selectedDeviceIds)
            : undefined,
      },
    });
  };

  const orderedCategories = CATEGORY_ORDER.filter((cat) => modulesByCategory[cat]?.length);

  const totalModules = allModuleIds().length;

  // Compute total estimated collection size for selected modules
  const estimatedSizeMb = useMemo(() => {
    let total = 0;
    for (const entries of Object.values(modulesByCategory)) {
      for (const m of entries) {
        if (selected.has(m.id) && m.estimated_size_mb) {
          total += m.estimated_size_mb;
        }
      }
    }
    return total;
  }, [modulesByCategory, selected]);

  const formatSize = (mb: number): string => {
    if (mb < 1) return `~${Math.round(mb * 1024)} KB`;
    if (mb < 1024) return `~${mb.toFixed(0)} MB`;
    return `~${(mb / 1024).toFixed(1)} GB`;
  };

  // Filter modules by search query
  const searchLower = moduleSearch.trim().toLowerCase();
  const filteredCategories = searchLower
    ? Object.fromEntries(
        orderedCategories
          .map((cat) => [
            cat,
            (modulesByCategory[cat] ?? []).filter(
              (m) =>
                m.id.toLowerCase().includes(searchLower) ||
                m.category.toLowerCase().includes(searchLower) ||
                m.output_relpath.toLowerCase().includes(searchLower),
            ),
          ])
          .filter(([, mods]) => (mods as ModuleEntry[]).length > 0),
      )
    : modulesByCategory;
  const visibleCategories = searchLower
    ? Object.keys(filteredCategories)
    : orderedCategories;

  return (
    <div className="min-h-screen bg-background tactical-grid flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Shield className="w-6 h-6 text-primary" />
            <div>
              <h1 className="font-mono text-lg font-bold tracking-wider text-foreground">
                ARTIFACT SELECTOR
              </h1>
              <p className="font-mono text-xs text-muted-foreground">
                INCIDENT: {incident?.id ?? incidentId ?? "PENDING"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* OS selector — auto-detected with manual override */}
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">OS:</span>
              {OS_OPTIONS.map((os) => (
                <button
                  key={os}
                  disabled={isViewer || isLoading}
                  onClick={() => handleOsChange(os)}
                  title={os === detectedOS ? `Auto-detected: ${os}` : undefined}
                  className={[
                    "font-mono text-xs px-2 py-0.5 border transition-colors",
                    activeOS === os
                      ? "bg-primary text-primary-foreground border-primary"
                      : "text-muted-foreground border-border hover:border-primary hover:text-foreground",
                    isViewer || isLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                  ].join(" ")}
                >
                  {os.toUpperCase()}
                  {os === detectedOS && (
                    <span className="ml-1 text-[10px] opacity-60">●</span>
                  )}
                </button>
              ))}
              {osOverride && osOverride !== detectedOS && (
                <span className="font-mono text-[10px] text-yellow-400">OVERRIDE</span>
              )}
            </div>
            <StatusIndicator
              status={isLoading ? "active" : "online"}
              label={isLoading ? "LOADING" : "READY"}
              pulse={isLoading}
            />
          </div>
        </div>
      </header>

      {errorMessage && (
        <WarningBanner variant="critical">
          <AlertTriangle className="inline w-4 h-4 mr-2" />
          {errorMessage}
        </WarningBanner>
      )}

      {activeOS === "macos" && (
        <WarningBanner variant="warning">
          macOS collection uses standard system tools (ps, launchctl, log, system_profiler). Some
          artifacts require Full Disk Access for the agent process. Unified Log collection may be
          large — consider using the Triage profile.
        </WarningBanner>
      )}

      <main className="flex-1 p-6 overflow-auto">
        <div className="grid grid-cols-12 gap-6">
          {/* Left — module picker */}
          <div className="col-span-8 space-y-4">
            {/* Profile quick-select */}
            <TacticalPanel title="COLLECTION PROFILES">
              <div className="flex gap-3 flex-wrap">
                {profiles.map((profile) => (
                  <button
                    key={profile.id}
                    disabled={isViewer}
                    onClick={() => applyProfile(profile.id)}
                    className={[
                      "font-mono text-xs px-4 py-2 border transition-colors",
                      activeProfile === profile.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "text-muted-foreground border-border hover:border-primary hover:text-foreground",
                      isViewer ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                    ].join(" ")}
                  >
                    <div className="font-bold">{profile.label.toUpperCase()}</div>
                    <div className="opacity-70">
                      {profile.module_counts[activeOS] ?? 0} modules
                    </div>
                  </button>
                ))}
              </div>
              {profiles.find((p) => p.id === activeProfile) && (
                <p className="font-mono text-xs text-muted-foreground mt-3">
                  {profiles.find((p) => p.id === activeProfile)?.description}
                </p>
              )}
            </TacticalPanel>

            {/* Module search */}
            <div className="flex items-center gap-2 px-1">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <input
                  className="w-full h-8 pl-7 pr-7 bg-background border border-input rounded-sm font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
                  placeholder="Search modules (e.g. prefetch, evtx, registry)..."
                  value={moduleSearch}
                  onChange={(e) => setModuleSearch(e.target.value)}
                />
                {moduleSearch && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setModuleSearch("")}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              {moduleSearch && (
                <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {visibleCategories.reduce(
                    (acc, cat) => acc + ((filteredCategories[cat] as ModuleEntry[] | undefined)?.length ?? 0),
                    0,
                  )} results
                </span>
              )}
            </div>

            {/* Module categories */}
            {isLoading ? (
              <div className="font-mono text-sm text-muted-foreground text-center py-12">
                LOADING MODULES...
              </div>
            ) : visibleCategories.length === 0 ? (
              <div className="font-mono text-sm text-muted-foreground text-center py-12">
                No modules match "{moduleSearch}"
              </div>
            ) : (
              visibleCategories.map((cat) => {
                const mods = (filteredCategories[cat] as ModuleEntry[] | undefined) ?? (modulesByCategory[cat] ?? []);
                const catSelected = mods.filter((m) => selected.has(m.id)).length;
                const isCollapsed = collapsedCategories.has(cat);
                return (
                  <TacticalPanel
                    key={cat}
                    title={CATEGORY_LABELS[cat] ?? cat.toUpperCase()}
                    headerActions={
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-mono text-xs border px-2 py-0.5 ${CATEGORY_BADGE[cat] ?? ""}`}
                        >
                          {catSelected}/{mods.length}
                        </span>
                        {!isViewer && (
                          <>
                            <button
                              onClick={() => selectCategory(cat)}
                              className="font-mono text-xs text-primary hover:underline"
                            >
                              ALL
                            </button>
                            <span className="text-muted-foreground">|</span>
                            <button
                              onClick={() => clearCategory(cat)}
                              className="font-mono text-xs text-muted-foreground hover:text-foreground"
                            >
                              NONE
                            </button>
                            <span className="text-muted-foreground">|</span>
                          </>
                        )}
                        <button
                          onClick={() => toggleCategory(cat)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {isCollapsed ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronUp className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    }
                  >
                    {!isCollapsed && (
                      <div className="grid grid-cols-2 gap-2">
                        {mods.map((mod) => (
                          <label
                            key={mod.id}
                            className={[
                              "flex items-start gap-3 p-2 border transition-colors",
                              selected.has(mod.id)
                                ? "border-primary/30 bg-primary/5"
                                : "border-transparent",
                              isViewer
                                ? "cursor-not-allowed opacity-60"
                                : "cursor-pointer hover:border-border",
                            ].join(" ")}
                          >
                            <Checkbox
                              checked={selected.has(mod.id)}
                              onCheckedChange={() => toggleModule(mod.id)}
                              disabled={isViewer}
                              className="mt-0.5"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="font-mono text-xs text-foreground truncate">
                                {mod.id.replace(/_/g, " ").toUpperCase()}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs text-muted-foreground truncate flex-1">
                                  {mod.output_relpath}
                                </span>
                                {mod.estimated_size_mb != null && mod.estimated_size_mb > 0 && (
                                  <span className="font-mono text-[10px] text-muted-foreground/60 shrink-0">
                                    {formatSize(mod.estimated_size_mb)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </TacticalPanel>
                );
              })
            )}
          </div>

          {/* Right — summary + action */}
          <div className="col-span-4 space-y-6">
            <TacticalPanel title="COLLECTION SUMMARY">
              <div className="space-y-3 font-mono text-sm">
                <KeyValueRow label="INCIDENT:" value={incident?.id ?? "PENDING"} />
                <KeyValueRow
                  label="TARGET OS:"
                  value={
                    osOverride && osOverride !== detectedOS
                      ? `${activeOS.toUpperCase()} (override)`
                      : `${activeOS.toUpperCase()} (auto)`
                  }
                  valueClassName="text-primary"
                />
                <KeyValueRow
                  label="SELECTED:"
                  value={`${selected.size} / ${totalModules} modules`}
                  valueClassName="text-primary"
                />
                <KeyValueRow
                  label="EST. SIZE:"
                  value={estimatedSizeMb > 0 ? formatSize(estimatedSizeMb) : "—"}
                  valueClassName={estimatedSizeMb > 10240 ? "text-yellow-500" : "text-primary"}
                />
                <KeyValueRow
                  label="PROFILE:"
                  value={
                    activeProfile
                      ? (profiles.find((p) => p.id === activeProfile)?.label ?? activeProfile).toUpperCase()
                      : "CUSTOM"
                  }
                  valueClassName={activeProfile ? "text-primary" : "text-muted-foreground"}
                />
              </div>

              {/* Per-category count breakdown */}
              <div className="mt-4 space-y-1 border-t border-border pt-3">
                {orderedCategories.map((cat) => {
                  const mods = modulesByCategory[cat] ?? [];
                  const n = mods.filter((m) => selected.has(m.id)).length;
                  return (
                    <div key={cat} className="flex justify-between font-mono text-xs">
                      <span className="text-muted-foreground">
                        {CATEGORY_LABELS[cat] ?? cat.toUpperCase()}
                      </span>
                      <span className={n > 0 ? "text-foreground" : "text-muted-foreground/50"}>
                        {n}/{mods.length}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Device selection — shown only for multi-host incidents */}
              {devices.length > 1 && (
                <div className="mt-4 border-t border-border pt-3">
                  <div className="flex items-center justify-between font-mono text-xs text-muted-foreground mb-2">
                    <span>TARGET DEVICES</span>
                    <div className="flex gap-2">
                      <button
                        className="hover:text-primary"
                        onClick={() => setSelectedDeviceIds(new Set(devices.map((d) => d.id)))}
                        disabled={isViewer}
                      >
                        ALL
                      </button>
                      <span>|</span>
                      <button
                        className="hover:text-foreground"
                        onClick={() => setSelectedDeviceIds(new Set())}
                        disabled={isViewer}
                      >
                        NONE
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {devices.map((device) => (
                      <label
                        key={device.id}
                        className={[
                          "flex items-center gap-2 px-1 py-0.5 font-mono text-xs cursor-pointer",
                          selectedDeviceIds.has(device.id)
                            ? "text-foreground"
                            : "text-muted-foreground/50",
                          isViewer ? "cursor-not-allowed" : "",
                        ].join(" ")}
                      >
                        <Checkbox
                          checked={selectedDeviceIds.has(device.id)}
                          onCheckedChange={() => {
                            if (isViewer) return;
                            setSelectedDeviceIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(device.id)) next.delete(device.id);
                              else next.add(device.id);
                              return next;
                            });
                          }}
                          disabled={isViewer}
                        />
                        <span className="truncate">{device.hostname}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground/50">
                          {device.os?.split("/")[0] ?? ""}
                        </span>
                      </label>
                    ))}
                  </div>
                  {selectedDeviceIds.size === 0 && (
                    <div className="mt-1 font-mono text-[10px] text-destructive">
                      No devices selected — collection will not run
                    </div>
                  )}
                </div>
              )}
            </TacticalPanel>

            <div className="space-y-3">
              <Button
                variant="tactical"
                size="lg"
                className="w-full"
                disabled={isViewer || selected.size === 0 || isLoading}
                onClick={handleStartCollection}
              >
                <Play className="w-4 h-4" />
                {isViewer
                  ? "VIEW ONLY"
                  : selected.size === 0
                  ? "SELECT MODULES"
                  : `COLLECT ${selected.size} ARTIFACTS`}
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={() => navigate("/dashboard")}
              >
                CANCEL
              </Button>
            </div>

            {isViewer && (
              <WarningBanner variant="warning">
                Viewer accounts cannot start collections.
              </WarningBanner>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-border bg-secondary px-6 py-2 flex items-center justify-between font-mono text-xs text-muted-foreground">
        <span>INCIDENT: {incident?.id ?? "PENDING"}</span>
        <span>TYPE: {incident?.type ?? "—"}</span>
        <span>{new Date().toISOString()}</span>
      </footer>
    </div>
  );
}

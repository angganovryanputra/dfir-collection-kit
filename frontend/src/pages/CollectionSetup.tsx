import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TacticalPanel } from "@/components/TacticalPanel";
import { WarningBanner } from "@/components/WarningBanner";
import { StatusIndicator } from "@/components/StatusIndicator";
import { KeyValueRow } from "@/components/common/KeyValueRow";
import { Shield, Play, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { apiGet } from "@/lib/api";
import { getStoredRole, isViewerRole } from "@/lib/auth";

type ModuleEntry = {
  id: string;
  os: string;
  category: string;
  priority: number;
  output_relpath: string;
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

  const isViewer = isViewerRole(getStoredRole());

  useEffect(() => {
    const load = async () => {
      if (!incidentId) {
        setErrorMessage("Missing incident identifier.");
        return;
      }
      try {
        const incidents = await apiGet<IncidentSummary[]>("/incidents");
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
    setActiveProfile(profileId);
    if (profileId === "full") {
      setSelected(new Set(allModuleIds()));
      return;
    }
    try {
      const resp = await apiGet<{ modules: ModuleEntry[] }>(
        `/modules/profiles/${profileId}?os=${activeOS}`
      );
      const profileIds = new Set(resp.modules.map((m) => m.id));
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
      state: { selectedModuleIds: Array.from(selected), profile: activeProfile },
    });
  };

  const orderedCategories = CATEGORY_ORDER.filter((cat) => modulesByCategory[cat]?.length);

  const totalModules = allModuleIds().length;

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

            {/* Module categories */}
            {isLoading ? (
              <div className="font-mono text-sm text-muted-foreground text-center py-12">
                LOADING MODULES...
              </div>
            ) : (
              orderedCategories.map((cat) => {
                const mods = modulesByCategory[cat] ?? [];
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
                            <div className="min-w-0">
                              <div className="font-mono text-xs text-foreground truncate">
                                {mod.id.replace(/_/g, " ").toUpperCase()}
                              </div>
                              <div className="font-mono text-xs text-muted-foreground truncate">
                                {mod.output_relpath}
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

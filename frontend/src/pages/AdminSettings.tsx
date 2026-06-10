import { useEffect, useState, useCallback } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TacticalPanel } from "@/components/TacticalPanel";
import { StatusIndicator } from "@/components/StatusIndicator";
import { TablePagination } from "@/components/TablePagination";
import { usePagination } from "@/hooks/usePagination";
import { FormLabel } from "@/components/common/FormLabel";
import { KeyValueRow } from "@/components/common/KeyValueRow";
import { TableHeaderRow } from "@/components/common/TableHeaderRow";
import { SearchInput } from "@/components/common/SearchInput";
import { SelectableButton } from "@/components/common/SelectableButton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Users,
  Server,
  Settings,
  Plus,
  Trash2,
  Edit2,
  Save,
  UserPlus,
  Power,
  RefreshCw,
  Shield,
  FileText,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  CircleDashed,
  Key,
  Eye,
  EyeOff,
  Download,
  Calendar,
  Brain,
  Link2,
  Unlink2,
  ExternalLink,
} from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";

interface User {
  id: string;
  username: string;
  role: "operator" | "viewer" | "admin";
  status: "active" | "inactive" | "locked";
  lastLogin: string;
  createdAt: string;
}

interface UserResponse {
  id: string;
  username: string;
  role: "operator" | "viewer" | "admin";
  status: "active" | "inactive" | "locked";
  last_login: string;
  created_at: string;
}

interface CollectorConfig {
  id: string;
  name: string;
  endpoint: string;
  status: "online" | "offline" | "maintenance";
  lastHeartbeat: string;
}

interface CollectorResponse {
  id: string;
  name: string;
  endpoint: string;
  status: "online" | "offline" | "maintenance";
  last_heartbeat: string;
}

interface SystemSettingsResponse {
  id: string;
  evidence_storage_path: string;
  max_file_size_gb: number;
  hash_algorithm: string;
  collection_timeout_min: number;
  max_concurrent_jobs: number;
  retry_attempts: number;
  session_timeout_min: number;
  max_failed_logins: number;
  log_retention_days: number;
  export_format: string;
  ez_tools_path: string | null;
  chainsaw_path: string | null;
  hayabusa_path: string | null;
  sigma_rules_path: string | null;
  yara_rules_path: string | null;
  timesketch_url: string | null;
  auto_process: boolean;
  webhook_url: string | null;
  notification_email: string | null;
  agent_binary_path: string | null;
}

interface AuditLogEntry {
  id: string;
  event_id: string;
  timestamp: string;
  event_type: string;
  actor_type: string;
  actor_id: string;
  source: string;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  status: string;
  message: string;
}

interface AuditLogListResponse {
  total: number;
  entries: AuditLogEntry[];
}

const mapUser = (user: UserResponse): User => ({
  id: user.id,
  username: user.username,
  role: user.role,
  status: user.status,
  lastLogin: user.last_login,
  createdAt: user.created_at,
});

const mapCollector = (collector: CollectorResponse): CollectorConfig => ({
  id: collector.id,
  name: collector.name,
  endpoint: collector.endpoint,
  status: collector.status,
  lastHeartbeat: collector.last_heartbeat,
});


interface IOCIndicator {
  id: string;
  ioc_type: string;
  value: string;
  description: string | null;
  source: string | null;
  severity: string;
  created_by: string;
  created_at: string;
}

type TabType = "users" | "collectors" | "system" | "audit" | "threatintel" | "ai";

function pwStrength(pw: string): 0 | 1 | 2 | 3 {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[0-9]/.test(pw)) s++;
  return Math.min(3, s) as 0 | 1 | 2 | 3;
}
const PW_LABEL = ["", "WEAK", "MEDIUM", "STRONG"];
const PW_COLOR = ["", "bg-destructive", "bg-yellow-500", "bg-green-500"];

// ── AI Provider config ────────────────────────────────────────────────────────

const AI_PROVIDERS = [
  { id: "openai",     label: "OpenAI (ChatGPT)",  defaultModel: "gpt-4o-mini",        defaultUrl: "https://api.openai.com/v1",                             hasOAuth: false, apiKeyLink: "https://platform.openai.com/api-keys",                   note: "API key from platform.openai.com" },
  { id: "anthropic",  label: "Anthropic (Claude)", defaultModel: "claude-sonnet-4-6",  defaultUrl: "https://api.anthropic.com/v1",                          hasOAuth: false, apiKeyLink: "https://console.anthropic.com/settings/keys",            note: "API key from console.anthropic.com" },
  { id: "gemini",     label: "Google Gemini",      defaultModel: "gemini-2.0-flash",   defaultUrl: "https://generativelanguage.googleapis.com/v1beta/openai", hasOAuth: true,  apiKeyLink: "https://aistudio.google.com/app/apikey",                 note: "API key or connect via Google OAuth" },
  { id: "openrouter", label: "OpenRouter",          defaultModel: "openai/gpt-4o-mini", defaultUrl: "https://openrouter.ai/api/v1",                          hasOAuth: false, apiKeyLink: "https://openrouter.ai/keys",                             note: "API key from openrouter.ai" },
  { id: "ollama",     label: "Ollama (Local)",      defaultModel: "llama3",             defaultUrl: "http://localhost:11434/v1",                              hasOAuth: false, apiKeyLink: "",                                                       note: "No API key needed — runs locally" },
] as const;

type AIProvider = typeof AI_PROVIDERS[number]["id"];

function generatePKCEPair(): { verifier: string; challenge: Promise<string> } {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  const verifier = btoa(String.fromCharCode(...array)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const challenge = crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)).then((buf) =>
    btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
  );
  return { verifier, challenge };
}

export default function AdminSettings() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const tab = searchParams.get("tab");
    return (tab === "ai" || tab === "users" || tab === "collectors" || tab === "system" || tab === "audit" || tab === "threatintel") ? tab as TabType : "users";
  });
  const [users, setUsers] = useState<User[]>([]);
  const [collectors, setCollectors] = useState<CollectorConfig[]>([]);
  const [systemSettings, setSystemSettings] = useState<SystemSettingsResponse | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState<{ username: string; password: string; role: User["role"] }>({
    username: "",
    password: "",
    role: "operator",
  });
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUserRole, setEditUserRole] = useState<User["role"]>("operator");
  const [editUserStatus, setEditUserStatus] = useState<User["status"]>("active");
  const [editUserPassword, setEditUserPassword] = useState("");
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selfUsername: string = (() => {
    try {
      return (JSON.parse(localStorage.getItem("dfir_auth") ?? "{}") as { username?: string }).username ?? "";
    } catch { return ""; }
  })();
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [isRefreshingCollectors, setIsRefreshingCollectors] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditEventType, setAuditEventType] = useState("");
  const [auditActorId, setAuditActorId] = useState("");
  const [auditTargetId, setAuditTargetId] = useState("");
  const [auditDateFrom, setAuditDateFrom] = useState("");
  const [auditDateTo, setAuditDateTo] = useState("");
  const [auditStatusFilter, setAuditStatusFilter] = useState<"all" | "success" | "failure">("all");
  const [auditExpandedId, setAuditExpandedId] = useState<string | null>(null);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditItemsPerPage, setAuditItemsPerPage] = useState(25);
  const [iocIndicators, setIocIndicators] = useState<IOCIndicator[]>([]);
  const [iocTypeFilter, setIocTypeFilter] = useState("all");
  const [iocTotal, setIocTotal] = useState(0);
  const [newIoc, setNewIoc] = useState({ ioc_type: "ip", value: "", description: "", severity: "high" });
  const [isAddingIoc, setIsAddingIoc] = useState(false);
  interface ToolResult {
    ok: boolean;
    status: string;
    path: string | null;
    found_count?: number;
    total_count?: number;
    dlls?: Record<string, { found: boolean; path: string }>;
    detail?: string;
    last_validated_at?: string | null;
    version?: string | null;
  }
  const [toolStatus, setToolStatus] = useState<Record<string, ToolResult> | null>(null);
  const [isVerifyingTools, setIsVerifyingTools] = useState(false);
  const [validatingTool, setValidatingTool] = useState<string | null>(null);

  // ── AI Config state ──────────────────────────────────────────────────────
  const [aiProvider, setAiProvider] = useState<AIProvider>("openai");
  const [aiModel, setAiModel] = useState("");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiApiUrl, setAiApiUrl] = useState("");
  const [aiShowKey, setAiShowKey] = useState(false);
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [googleShowSecret, setGoogleShowSecret] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [isSavingAi, setIsSavingAi] = useState(false);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [aiMessage, setAiMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: () => apiGet<UserResponse[]>("/users"),
  });

  const collectorsQuery = useQuery({
    queryKey: ["collectors"],
    queryFn: () => apiGet<CollectorResponse[]>("/collectors"),
  });

  const settingsQuery = useQuery({
    queryKey: ["system-settings"],
    queryFn: () => apiGet<SystemSettingsResponse | null>("/settings"),
  });

  useEffect(() => {
    if (usersQuery.error || collectorsQuery.error || settingsQuery.error) {
      setErrorMessage("Unable to load admin configuration.");
    }
  }, [usersQuery.error, collectorsQuery.error, settingsQuery.error]);

  useEffect(() => {
    if (usersQuery.data) {
      setUsers(usersQuery.data.map(mapUser));
      setErrorMessage(null);
    }
  }, [usersQuery.data]);

  useEffect(() => {
    if (collectorsQuery.data) {
      setCollectors(collectorsQuery.data.map(mapCollector));
      setErrorMessage(null);
    }
  }, [collectorsQuery.data]);

  useEffect(() => {
    if (settingsQuery.data) {
      setSystemSettings(settingsQuery.data);
      setErrorMessage(null);
    }
  }, [settingsQuery.data]);

  // ── Load AI config when AI tab is active ──────────────────────────────────
  useEffect(() => {
    if (activeTab !== "ai") return;
    apiGet<{
      provider: string; model: string; api_url: string; api_key_set: boolean;
      google_oauth_client_id: string; google_oauth_connected: boolean;
    }>("/ai/config")
      .then((cfg) => {
        setAiProvider((cfg.provider as AIProvider) || "openai");
        setAiModel(cfg.model || "");
        setAiApiUrl(cfg.api_url || "");
        setGoogleClientId(cfg.google_oauth_client_id || "");
        setGoogleConnected(cfg.google_oauth_connected);
        if (cfg.api_key_set) setAiApiKey("***");
      })
      .catch(() => { /* best-effort */ });
  }, [activeTab]);

  // ── Google OAuth PKCE callback detection ─────────────────────────────────
  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    if (!code || state !== "google_oauth_gemini") return;
    const verifier = sessionStorage.getItem("google_pkce_verifier");
    const redirectUri = sessionStorage.getItem("google_oauth_redirect_uri");
    if (!verifier || !redirectUri) return;
    setActiveTab("ai");
    setIsConnectingGoogle(true);
    apiPost<{ connected: boolean; scope: string }>("/ai/oauth/google/exchange", {
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    })
      .then((r) => {
        setGoogleConnected(r.connected);
        setAiMessage({ ok: true, text: "Google account connected successfully." });
        sessionStorage.removeItem("google_pkce_verifier");
        sessionStorage.removeItem("google_oauth_redirect_uri");
        setSearchParams({}, { replace: true });
      })
      .catch((err) => {
        setAiMessage({ ok: false, text: `OAuth failed: ${err instanceof Error ? err.message.slice(0, 150) : "Unknown error"}` });
      })
      .finally(() => setIsConnectingGoogle(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGoogleConnect = useCallback(async () => {
    if (!googleClientId) {
      setAiMessage({ ok: false, text: "Enter your Google OAuth Client ID first." });
      return;
    }
    const { verifier, challenge } = generatePKCEPair();
    const codeChallenge = await challenge;
    const redirectUri = `${window.location.origin}/admin/settings`;
    sessionStorage.setItem("google_pkce_verifier", verifier);
    sessionStorage.setItem("google_oauth_redirect_uri", redirectUri);
    const params = new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/generative-language",
      access_type: "offline",
      prompt: "consent",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state: "google_oauth_gemini",
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }, [googleClientId]);

  const handleGoogleDisconnect = useCallback(async () => {
    try {
      await apiDelete("/ai/oauth/google/disconnect");
      setGoogleConnected(false);
      setAiMessage({ ok: true, text: "Google account disconnected." });
    } catch {
      setAiMessage({ ok: false, text: "Failed to disconnect." });
    }
  }, []);

  const handleSaveAiConfig = useCallback(async () => {
    setIsSavingAi(true);
    setAiMessage(null);
    const selectedProvider = AI_PROVIDERS.find(p => p.id === aiProvider);
    const body: Record<string, unknown> = {
      ai_provider: aiProvider,
      ai_model: aiModel || selectedProvider?.defaultModel || "",
      ai_api_url: aiApiUrl || selectedProvider?.defaultUrl || "",
      google_oauth_client_id: googleClientId || null,
    };
    if (aiApiKey && aiApiKey !== "***") body.ai_api_key = aiApiKey;
    if (googleClientSecret && googleClientSecret !== "***") body.google_oauth_client_secret = googleClientSecret;
    try {
      await apiPut("/settings", { ...systemSettings, ...body });
      setAiMessage({ ok: true, text: "AI configuration saved." });
      if (aiApiKey && aiApiKey !== "***") setAiApiKey("***");
      if (googleClientSecret && googleClientSecret !== "***") setGoogleClientSecret("***");
    } catch (err) {
      setAiMessage({ ok: false, text: err instanceof Error ? err.message.slice(0, 200) : "Save failed" });
    } finally {
      setIsSavingAi(false);
    }
  }, [aiProvider, aiModel, aiApiKey, aiApiUrl, googleClientId, googleClientSecret, systemSettings]);

  const loadAdminData = async () => {
    setErrorMessage(null);
    await Promise.all([
      usersQuery.refetch(),
      collectorsQuery.refetch(),
      settingsQuery.refetch(),
    ]);
  };

  const buildAuditParams = (extra?: { limit?: number; offset?: number }) => {
    const params = new URLSearchParams();
    params.set("limit", String(extra?.limit ?? auditItemsPerPage));
    params.set("offset", String(extra?.offset ?? (auditPage - 1) * auditItemsPerPage));
    if (debouncedAuditEventType.trim()) params.set("event_type", debouncedAuditEventType.trim());
    if (debouncedAuditActorId.trim()) params.set("actor_id", debouncedAuditActorId.trim());
    if (debouncedAuditTargetId.trim()) params.set("target_id", debouncedAuditTargetId.trim());
    if (auditDateFrom) params.set("date_from", auditDateFrom);
    if (auditDateTo) params.set("date_to", auditDateTo);
    if (auditStatusFilter !== "all") params.set("status", auditStatusFilter);
    return params;
  };

  const loadAuditLogs = async () => {
    setErrorMessage(null);
    try {
      const response = await apiGet<AuditLogListResponse>(`/audit-logs?${buildAuditParams().toString()}`);
      setAuditLogs(response.entries);
      setAuditTotal(response.total);
    } catch {
      setErrorMessage("Unable to load audit log entries.");
    }
  };

  const exportAuditLogs = async () => {
    try {
      const params = buildAuditParams({ limit: 10000, offset: 0 });
      const response = await apiGet<AuditLogListResponse>(`/audit-logs?${params.toString()}`);
      const header = "timestamp,event_type,actor_id,action,target_type,target_id,status,message,source\n";
      const rows = response.entries.map((e) =>
        [e.timestamp, e.event_type, e.actor_id, e.action, e.target_type ?? "", e.target_id ?? "", e.status, `"${e.message.replace(/"/g, '""')}"`, e.source].join(",")
      ).join("\n");
      const blob = new Blob([header + rows], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErrorMessage("Unable to export audit log.");
    }
  };

  // Debounce free-text audit filters to avoid firing an API call on every keystroke
  const debouncedAuditEventType = useDebounce(auditEventType, 400);
  const debouncedAuditActorId = useDebounce(auditActorId, 400);
  const debouncedAuditTargetId = useDebounce(auditTargetId, 400);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeTab !== "audit") return;
    loadAuditLogs();
  }, [activeTab, auditPage, auditItemsPerPage, debouncedAuditEventType, debouncedAuditActorId, debouncedAuditTargetId, auditDateFrom, auditDateTo, auditStatusFilter]);

  const loadIOCIndicators = async () => {
    setErrorMessage(null);
    try {
      const params = new URLSearchParams({ limit: "200", offset: "0" });
      if (iocTypeFilter !== "all") params.set("ioc_type", iocTypeFilter);
      const data = await apiGet<IOCIndicator[]>(`/processing/ioc/indicators?${params}`);
      setIocIndicators(data);
      setIocTotal(data.length);
    } catch {
      setErrorMessage("Unable to load IOC indicators.");
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeTab !== "threatintel") return;
    loadIOCIndicators();
  }, [activeTab, iocTypeFilter]);

  const handleAddIOC = async () => {
    if (!newIoc.value.trim()) {
      setErrorMessage("IOC value is required.");
      return;
    }
    setIsAddingIoc(true);
    setErrorMessage(null);
    try {
      await apiPost<IOCIndicator>("/processing/ioc/indicators", {
        ioc_type: newIoc.ioc_type,
        value: newIoc.value.trim(),
        description: newIoc.description.trim() || null,
        source: null,
        severity: newIoc.severity,
      });
      setNewIoc({ ioc_type: "ip", value: "", description: "", severity: "high" });
      await loadIOCIndicators();
    } catch {
      setErrorMessage("Unable to add IOC indicator.");
    } finally {
      setIsAddingIoc(false);
    }
  };

  const handleDeleteIOC = async (id: string) => {
    setErrorMessage(null);
    try {
      await apiDelete(`/processing/ioc/indicators/${id}`);
      setIocIndicators((current) => current.filter((i) => i.id !== id));
      setIocTotal((t) => t - 1);
    } catch {
      setErrorMessage("Unable to delete IOC indicator.");
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const raw = localStorage.getItem("dfir_auth");
    if (!raw) {
      navigate("/login", { replace: true });
      return;
    }
    try {
      const parsed = JSON.parse(raw) as { role?: string };
      if (parsed.role !== "admin") {
        navigate("/dashboard", { replace: true });
        return;
      }
    } catch {
      navigate("/login", { replace: true });
      return;
    }
    void loadAdminData();
  }, [navigate]);

  const {
    paginatedItems: paginatedUsers,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    goToPage,
    setPerPage,
  } = usePagination(users);

  const auditTotalPages = Math.max(1, Math.ceil(auditTotal / auditItemsPerPage));

  const getRoleColor = (role: User["role"]) => {
    switch (role) {
      case "admin":
        return "text-destructive border-destructive/30 bg-destructive/10";
      case "operator":
        return "text-primary border-primary/30 bg-primary/10";
      case "viewer":
        return "text-muted-foreground border-border bg-secondary";
    }
  };

  const getStatusIndicator = (status: User["status"]) => {
    switch (status) {
      case "active":
        return <StatusIndicator status="online" label="ACTIVE" size="sm" />;
      case "inactive":
        return <StatusIndicator status="offline" label="INACTIVE" size="sm" />;
      case "locked":
        return <StatusIndicator status="pending" label="LOCKED" size="sm" />;
    }
  };

  const handleAddUser = async () => {
    if (!newUser.username.trim()) {
      setErrorMessage("Username is required.");
      return;
    }
    if (!newUser.password.trim()) {
      setErrorMessage("Password is required.");
      return;
    }
    try {
      const created = await apiPost<UserResponse>("/users", {
        username: newUser.username,
        role: newUser.role,
        status: "active",
        password: newUser.password,
      });
      setUsers([...users, mapUser(created)]);
      setNewUser({ username: "", password: "", role: "operator" });
      setShowAddUser(false);
    } catch {
      setErrorMessage("Unable to add user.");
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setConfirmDeleteId(null);
    try {
      await apiDelete(`/users/${id}`);
      setUsers(users.filter((u) => u.id !== id));
    } catch {
      setErrorMessage("Unable to delete user.");
    }
  };

  const handleToggleUserStatus = async (id: string) => {
    const target = users.find((u) => u.id === id);
    if (!target) return;
    const nextStatus: User["status"] = target.status === "active" ? "locked" : "active";
    const updated: User = {
      ...target,
      status: nextStatus,
    };
    try {
      await apiPatch(`/users/${updated.id}`, { status: updated.status });
      setUsers(users.map((u) => (u.id === id ? updated : u)));
    } catch {
      setErrorMessage("Unable to update user status.");
    }
  };

  const openEditUserDialog = (user: User) => {
    setErrorMessage(null);
    setEditingUser(user);
    setEditUserRole(user.role);
    setEditUserStatus(user.status);
    setEditUserPassword("");
    setShowEditPassword(false);
    setIsEditUserOpen(true);
  };

  const handleAddUserDialogChange = (open: boolean) => {
    setShowAddUser(open);
    if (open) {
      setErrorMessage(null);
    }
  };

  const handleEditDialogChange = (open: boolean) => {
    setIsEditUserOpen(open);
    if (!open) {
      setEditingUser(null);
    }
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;
    setIsSavingUser(true);
    setErrorMessage(null);
    try {
      const payload: Record<string, unknown> = { role: editUserRole, status: editUserStatus };
      if (editUserPassword.trim()) payload.password = editUserPassword.trim();
      const updated = await apiPatch<UserResponse>(`/users/${editingUser.id}`, payload);
      const mapped = mapUser(updated);
      setUsers(users.map((user) => (user.id === mapped.id ? mapped : user)));
      setIsEditUserOpen(false);
      setEditingUser(null);
      setEditUserPassword("");
    } catch {
      setErrorMessage("Unable to update user.");
    } finally {
      setIsSavingUser(false);
    }
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: "users", label: "USER MANAGEMENT", icon: <Users className="w-4 h-4" /> },
    { id: "collectors", label: "COLLECTORS", icon: <Server className="w-4 h-4" /> },
    { id: "system", label: "SYSTEM CONFIG", icon: <Settings className="w-4 h-4" /> },
    { id: "audit", label: "AUDIT LOGS", icon: <FileText className="w-4 h-4" /> },
    { id: "threatintel", label: "THREAT INTEL", icon: <ShieldAlert className="w-4 h-4" /> },
    { id: "ai", label: "AI CONFIG", icon: <Brain className="w-4 h-4" /> },
  ];

  const refreshCollectors = async () => {
    setIsRefreshingCollectors(true);
    setErrorMessage(null);
    try {
      const collectorsData = await apiGet<CollectorResponse[]>("/collectors");
      setCollectors(collectorsData.map(mapCollector));
    } catch {
      setErrorMessage("Unable to refresh collector status.");
    } finally {
      setIsRefreshingCollectors(false);
    }
  };

  return (
    <AppLayout
      title="ADMIN SETTINGS"
      subtitle="SYSTEM CONFIGURATION & USER MANAGEMENT"
      showWarning
      warningMessage="CHANGES TO SYSTEM CONFIGURATION MAY AFFECT ONGOING COLLECTIONS — PROCEED WITH CAUTION"
      headerActions={
        <div className="flex items-center gap-2 font-mono text-xs text-destructive">
          <Shield className="w-4 h-4" />
          ADMIN ACCESS REQUIRED
        </div>
      }
    >
      <div className="p-6 h-full">
        {errorMessage && (
          <div className="mb-4 border border-destructive/40 bg-destructive/10 p-3 font-mono text-xs text-destructive">
            {errorMessage}
          </div>
        )}
        <div className="grid grid-cols-12 gap-6 h-full">
          {/* Sidebar Tabs */}
          <div className="col-span-3">
            <TacticalPanel title="CONFIGURATION" status="online">
              <div className="space-y-2">
                {tabs.map((tab) => (
                  <SelectableButton
                    key={tab.id}
                    isActive={activeTab === tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className="w-full flex items-center gap-3 p-3 text-left"
                    activeClassName="border-primary bg-primary/10 text-primary"
                    inactiveClassName="border-border bg-secondary text-muted-foreground hover:border-muted-foreground hover:text-foreground"
                  >
                    {tab.icon}
                    {tab.label}
                  </SelectableButton>
                ))}
              </div>
            </TacticalPanel>
          </div>

          {/* Content Area */}
          <div className="col-span-9 space-y-6">
            {/* Users Tab */}
            {activeTab === "users" && (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
                    Registered Users ({users.length})
                  </h2>
                  <Button
                    variant="tactical"
                    onClick={() => handleAddUserDialogChange(true)}
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    ADD USER
                  </Button>
                </div>

                {/* Users Table */}
                <TacticalPanel title="USER ACCOUNTS" className="flex flex-col">
                  <div className="space-y-0">
                    {/* Header */}
                    <TableHeaderRow className="grid grid-cols-12 gap-4">
                      <div className="col-span-3">Username</div>
                      <div className="col-span-2">Role</div>
                      <div className="col-span-2">Status</div>
                      <div className="col-span-2">Last Login</div>
                      <div className="col-span-3">Actions</div>
                    </TableHeaderRow>

                    {/* Rows */}
                    {paginatedUsers.length === 0 ? (
                      <div className="px-4 py-6 text-center font-mono text-xs text-muted-foreground">
                        No users available.
                      </div>
                    ) : (
                      paginatedUsers.map((user) => {
                        const isSelf = user.username === selfUsername;
                        return (
                        <div
                          key={user.id}
                          className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-border/50 hover:bg-secondary/30 transition-colors items-center"
                        >
                          <div className="col-span-3 font-mono text-sm font-bold flex items-center gap-2">
                            {user.username}
                            {isSelf && (
                              <span className="font-mono text-[10px] text-primary border border-primary/30 px-1">YOU</span>
                            )}
                          </div>
                          <div className="col-span-2">
                            <span
                              className={`px-2 py-1 font-mono text-xs uppercase border ${getRoleColor(
                                user.role
                              )}`}
                            >
                              {user.role}
                            </span>
                          </div>
                          <div className="col-span-2">
                            {getStatusIndicator(user.status)}
                          </div>
                          <div className="col-span-2 font-mono text-xs text-muted-foreground">
                            {user.lastLogin === "-"
                              ? "-"
                              : new Date(user.lastLogin).toLocaleDateString()}
                          </div>
                          <div className="col-span-3 flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Edit / Reset Password"
                              onClick={() => openEditUserDialog(user)}
                            >
                              <Edit2 className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isSelf}
                              onClick={() => !isSelf && handleToggleUserStatus(user.id)}
                              title={user.status === "active" ? "Lock User" : "Unlock User"}
                              className={isSelf ? "opacity-30" : ""}
                            >
                              <Power
                                className={`w-3 h-3 ${
                                  user.status === "active" ? "text-primary" : "text-warning"
                                }`}
                              />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isSelf}
                              onClick={() => !isSelf && handleDeleteUser(user.id)}
                              title={confirmDeleteId === user.id ? "Click again to confirm deletion" : "Delete User"}
                              className={`transition-colors ${confirmDeleteId === user.id ? "text-destructive bg-destructive/10" : ""} ${isSelf ? "opacity-30" : ""}`}
                            >
                              {confirmDeleteId === user.id
                                ? <span className="font-mono text-[10px]">CONFIRM?</span>
                                : <Trash2 className="w-3 h-3 text-muted-foreground" />
                              }
                            </Button>
                            {confirmDeleteId === user.id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setConfirmDeleteId(null)}
                                className="font-mono text-[10px] text-muted-foreground"
                              >
                                ✕
                              </Button>
                            )}
                          </div>
                        </div>
                        );
                      })
                    )}
                  </div>
                  <TablePagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={totalItems}
                    itemsPerPage={itemsPerPage}
                    onPageChange={goToPage}
                    onItemsPerPageChange={setPerPage}
                  />
                </TacticalPanel>
              </>
            )}

            {/* Collectors Tab */}
            {activeTab === "collectors" && (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
                    Collector Nodes ({collectors.length})
                  </h2>
                  <div className="flex gap-3">
                    <Button variant="secondary" onClick={refreshCollectors} disabled={isRefreshingCollectors}>
                      <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshingCollectors ? "animate-spin" : ""}`} />
                      {isRefreshingCollectors ? "REFRESHING" : "REFRESH STATUS"}
                    </Button>
                    <Button variant="tactical" disabled title="Provision collectors via backend API">
                      <Plus className="w-4 h-4 mr-2" />
                      ADD COLLECTOR
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {collectors.map((collector) => (
                    <TacticalPanel
                      key={collector.id}
                      title={collector.name}
                      status={collector.status === "online" ? "online" : "offline"}
                    >
                      <div className="space-y-4">
                        <div className="space-y-2 font-mono text-sm">
                          <KeyValueRow label="ID:" value={collector.id} />
                          <KeyValueRow
                            label="ENDPOINT:"
                            value={collector.endpoint}
                            valueClassName="text-xs"
                          />
                          <KeyValueRow
                            label="LAST HEARTBEAT:"
                            value={new Date(collector.lastHeartbeat).toLocaleTimeString()}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button variant="secondary" size="sm" className="flex-1" disabled>
                            <Edit2 className="w-3 h-3 mr-2" />
                            CONFIGURE
                          </Button>
                          <Button
                            variant={collector.status === "online" ? "destructive" : "tactical"}
                            size="sm"
                            className="flex-1"
                            onClick={async () => {
                              setErrorMessage(null);
                              try {
                                const updated = await apiPatch<CollectorResponse>(
                                  `/collectors/${collector.id}`,
                                  { status: collector.status === "online" ? "maintenance" : "online" }
                                );
                                setCollectors((current) =>
                                  current.map((item) =>
                                    item.id === collector.id ? mapCollector(updated) : item
                                  )
                                );
                              } catch {
                                setErrorMessage("Unable to update collector status.");
                              }
                            }}
                          >
                            <Power className="w-3 h-3 mr-2" />
                            {collector.status === "online" ? "DISABLE" : "ENABLE"}
                          </Button>
                        </div>
                      </div>
                    </TacticalPanel>
                  ))}
                </div>
              </>
            )}

            {/* System Tab */}
            {activeTab === "system" && (
              <>
                <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
                  System Configuration
                </h2>

                <div className="grid grid-cols-2 gap-6">
                  {/* Evidence Vault Settings */}
                  <TacticalPanel title="EVIDENCE VAULT" status="online">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <FormLabel className="text-muted-foreground uppercase">
                          Storage Path
                        </FormLabel>
                        <Input
                          defaultValue={systemSettings?.evidence_storage_path ?? "/vault/evidence"}
                          disabled
                        />

                      </div>
                      <div className="space-y-2">
                        <FormLabel className="text-muted-foreground uppercase">
                          Max File Size (GB)
                        </FormLabel>
                        <Input
                          type="number"
                          value={systemSettings?.max_file_size_gb ?? 10}
                          onChange={(event) =>
                            setSystemSettings((current) =>
                              current
                                ? {
                                    ...current,
                                    max_file_size_gb: Number(event.target.value),
                                  }
                                : current
                            )
                          }
                        />


                      </div>
                      <div className="space-y-2">
                        <FormLabel className="text-muted-foreground uppercase">
                          Hash Algorithm
                        </FormLabel>
                        <Input
                          defaultValue={systemSettings?.hash_algorithm ?? "SHA-256"}
                          disabled
                        />
                        <p className="font-mono text-xs text-muted-foreground">
                          Locked to safe defaults.
                        </p>

                      </div>
                    </div>
                  </TacticalPanel>

                  {/* Collection Settings */}
                  <TacticalPanel title="COLLECTION ENGINE" status="online">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <FormLabel className="text-muted-foreground uppercase">
                          Default Timeout (min)
                        </FormLabel>
                        <Input
                          type="number"
                          value={systemSettings?.collection_timeout_min ?? 30}
                          onChange={(event) =>
                            setSystemSettings((current) =>
                              current
                                ? {
                                    ...current,
                                    collection_timeout_min: Number(event.target.value),
                                  }
                                : current
                            )
                          }
                        />

                      </div>
                      <div className="space-y-2">
                        <FormLabel className="text-muted-foreground uppercase">
                          Max Concurrent Jobs
                        </FormLabel>
                        <Input
                          type="number"
                          value={systemSettings?.max_concurrent_jobs ?? 5}
                          onChange={(event) =>
                            setSystemSettings((current) =>
                              current
                                ? {
                                    ...current,
                                    max_concurrent_jobs: Number(event.target.value),
                                  }
                                : current
                            )
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <FormLabel className="text-muted-foreground uppercase">
                          Retry Attempts
                        </FormLabel>
                        <Input
                          type="number"
                          value={systemSettings?.retry_attempts ?? 3}
                          onChange={(event) =>
                            setSystemSettings((current) =>
                              current
                                ? {
                                    ...current,
                                    retry_attempts: Number(event.target.value),
                                  }
                                : current
                            )
                          }
                        />
                      </div>
                    </div>
                  </TacticalPanel>

                  {/* Session Settings */}
                  <TacticalPanel title="SESSION MANAGEMENT">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <FormLabel className="text-muted-foreground uppercase">
                          Session Timeout (min)
                        </FormLabel>
                        <Input
                          type="number"
                          value={systemSettings?.session_timeout_min ?? 15}
                          onChange={(event) =>
                            setSystemSettings((current) =>
                              current
                                ? {
                                    ...current,
                                    session_timeout_min: Number(event.target.value),
                                  }
                                : current
                            )
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <FormLabel className="text-muted-foreground uppercase">
                          Max Failed Logins
                        </FormLabel>
                        <Input
                          type="number"
                          value={systemSettings?.max_failed_logins ?? 5}
                          onChange={(event) =>
                            setSystemSettings((current) =>
                              current
                                ? {
                                    ...current,
                                    max_failed_logins: Number(event.target.value),
                                  }
                                : current
                            )
                          }
                        />
                      </div>
                    </div>
                  </TacticalPanel>

                  {/* Audit Settings */}
                  <TacticalPanel title="AUDIT LOGGING">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <FormLabel className="text-muted-foreground uppercase">
                          Log Retention (days)
                        </FormLabel>
                        <Input
                          type="number"
                          value={systemSettings?.log_retention_days ?? 365}
                          onChange={(event) =>
                            setSystemSettings((current) =>
                              current
                                ? {
                                    ...current,
                                    log_retention_days: Number(event.target.value),
                                  }
                                : current
                            )
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <FormLabel className="text-muted-foreground uppercase">
                          Export Format
                        </FormLabel>
                        <Input
                          defaultValue={systemSettings?.export_format ?? "JSON"}
                          disabled
                        />
                        <p className="font-mono text-xs text-muted-foreground">
                          Locked to safe defaults.
                        </p>
                      </div>
                    </div>
                  </TacticalPanel>

                  {/* Notifications & Alerts Settings */}
                  <TacticalPanel title="NOTIFICATIONS & ALERTS" className="col-span-2">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <FormLabel className="text-muted-foreground uppercase">
                          Webhook URL
                        </FormLabel>
                        <Input
                          value={systemSettings?.webhook_url ?? ""}
                          placeholder="https://hooks.slack.com/..."
                          onChange={(event) =>
                            setSystemSettings((current) =>
                              current ? { ...current, webhook_url: event.target.value || null } : current
                            )
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <FormLabel className="text-muted-foreground uppercase">
                          Notification Email
                        </FormLabel>
                        <Input
                          type="email"
                          value={systemSettings?.notification_email ?? ""}
                          placeholder="security@company.com"
                          onChange={(event) =>
                            setSystemSettings((current) =>
                              current ? { ...current, notification_email: event.target.value || null } : current
                            )
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <FormLabel className="text-muted-foreground uppercase">
                          Agent Binary Path
                        </FormLabel>
                        <Input
                          value={systemSettings?.agent_binary_path ?? ""}
                          placeholder="/opt/dfir-agents/"
                          onChange={(event) =>
                            setSystemSettings((current) =>
                              current ? { ...current, agent_binary_path: event.target.value || null } : current
                            )
                          }
                        />
                      </div>
                    </div>
                  </TacticalPanel>

                  {/* Forensics Pipeline Settings */}
                  <TacticalPanel title="FORENSICS PIPELINE — TOOLS INTEGRATION" className="col-span-2">
                    {/* Info banner */}
                    <div className="mb-4 p-3 rounded border border-yellow-500/30 bg-yellow-500/5 font-mono text-xs text-yellow-400">
                      Tools are NOT bundled. Install each tool on the server (or mount via Docker volume),
                      enter the path, then click <strong>VALIDATE</strong> to confirm detection.
                      Parsing will show an error if a required tool is configured but its DLL is missing.
                    </div>

                    {/* Global Tools Health */}
                    {toolStatus && (() => {
                      const allOk = Object.values(toolStatus).every(t => t.ok);
                      const someOk = Object.values(toolStatus).some(t => t.ok);
                      const allNotConfigured = Object.values(toolStatus).every(t => t.status === "not_configured");
                      const health = allNotConfigured ? "NOT CONFIGURED"
                        : allOk ? "HEALTHY"
                        : someOk ? "PARTIAL"
                        : "BROKEN";
                      const healthColor = health === "HEALTHY" ? "text-green-400 border-green-500/30 bg-green-500/5"
                        : health === "PARTIAL" ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/5"
                        : health === "BROKEN" ? "text-red-400 border-red-500/30 bg-red-500/5"
                        : "text-muted-foreground border-border bg-secondary/10";
                      return (
                        <div className={`mb-4 flex items-center gap-3 p-2.5 border rounded font-mono text-xs ${healthColor}`}>
                          <Shield className="w-4 h-4 shrink-0" />
                          <span className="font-bold tracking-widest">TOOLS HEALTH: {health}</span>
                          <span className="text-[10px] opacity-70">
                            {Object.values(toolStatus).filter(t => t.ok).length}/{Object.keys(toolStatus).length} TOOLS READY
                          </span>
                        </div>
                      );
                    })()}

                    {/* Tool path rows */}
                    {([
                      {
                        key: "ez_tools",
                        label: "EZ Tools Directory",
                        desc: "Eric Zimmerman's forensic toolset (13 parsers: EvtxECmd, MFTECmd, RECmd, PECmd, LECmd, WxTCmd, AmcacheParser, SrumECmd, AppCompatCacheParser, SBECmd, JLECmd, RBCmd, SQLECmd). Provide the root folder that contains each tool's subdirectory.",
                        field: "ez_tools_path" as const,
                        placeholder: "/opt/eztools",
                      },
                      {
                        key: "chainsaw",
                        label: "Chainsaw Binary",
                        desc: "Sigma-based Windows EVTX detection engine. Used for threat hunting and IOC matching against collected event logs.",
                        field: "chainsaw_path" as const,
                        placeholder: "/opt/chainsaw/chainsaw",
                      },
                      {
                        key: "hayabusa",
                        label: "Hayabusa Binary",
                        desc: "Fast Windows event log analyzer with Sigma rule support. Generates detection timelines from EVTX files.",
                        field: "hayabusa_path" as const,
                        placeholder: "/opt/hayabusa/hayabusa",
                      },
                      {
                        key: "sigma_rules",
                        label: "Sigma Rules Directory",
                        desc: "Directory containing Sigma detection rules (.yml). Used by Chainsaw and Hayabusa for detection coverage.",
                        field: "sigma_rules_path" as const,
                        placeholder: "/opt/sigma-rules",
                      },
                      {
                        key: "yara_rules",
                        label: "YARA Rules Directory",
                        desc: "Directory containing YARA rules (.yar/.yara). Used by the pipeline to scan collected binaries and artifacts for known malware signatures.",
                        field: "yara_rules_path" as const,
                        placeholder: "/opt/yara-rules",
                      },
                    ] as const).map(({ key, label, desc, field, placeholder }) => {
                      const ts = toolStatus?.[key];
                      const isValidatingThis = validatingTool === key;
                      return (
                        <div key={key} className="mb-5 border border-border/40 rounded p-3 bg-secondary/5">
                          {/* Header row: name + status badge + validate button */}
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <FormLabel className="text-foreground uppercase font-bold">{label}</FormLabel>
                            <div className="flex items-center gap-2">
                              {ts && (
                                <span className={`flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 border rounded ${
                                  ts.ok ? "text-green-400 border-green-500/30 bg-green-500/5"
                                    : ts.status === "not_configured" ? "text-muted-foreground border-border"
                                    : "text-red-400 border-red-500/30 bg-red-500/5"
                                }`}>
                                  {ts.ok ? (
                                    <>
                                      <CheckCircle2 className="w-3 h-3" />
                                      {key === "ez_tools" && ts.found_count !== undefined
                                        ? `${ts.found_count}/${ts.total_count} FOUND`
                                        : "DETECTED"}
                                    </>
                                  ) : ts.status === "not_configured" ? (
                                    <><CircleDashed className="w-3 h-3" /> NOT CONFIGURED</>
                                  ) : ts.status === "not_executable" ? (
                                    <><XCircle className="w-3 h-3" /> NOT EXECUTABLE</>
                                  ) : ts.status === "compile_error" ? (
                                    <><XCircle className="w-3 h-3" /> YARA COMPILE ERROR</>
                                  ) : ts.status === "no_dlls_found" ? (
                                    <><XCircle className="w-3 h-3" /> DIR FOUND — NO DLLs</>
                                  ) : ts.status === "partial" ? (
                                    <><ShieldAlert className="w-3 h-3 text-yellow-400" /> PARTIAL</>
                                  ) : (
                                    <><XCircle className="w-3 h-3" /> NOT FOUND</>
                                  )}
                                </span>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[10px] px-2 font-mono border border-border/40"
                                disabled={isValidatingThis || isVerifyingTools}
                                onClick={async () => {
                                  setValidatingTool(key);
                                  try {
                                    const result = await apiPost<ToolResult>(`/settings/verify-tools/${key}`, {});
                                    setToolStatus(prev => ({ ...(prev ?? {}), [key]: result }));
                                  } catch {
                                    setErrorMessage(`Failed to validate ${label}.`);
                                  } finally {
                                    setValidatingTool(null);
                                  }
                                }}
                              >
                                <RefreshCw className={`w-3 h-3 mr-1 ${isValidatingThis ? "animate-spin" : ""}`} />
                                {isValidatingThis ? "..." : "VALIDATE"}
                              </Button>
                            </div>
                          </div>

                          {/* Description */}
                          <p className="font-mono text-[10px] text-muted-foreground mb-2 leading-relaxed">{desc}</p>

                          {/* Path input */}
                          <Input
                            value={systemSettings?.[field] ?? ""}
                            placeholder={placeholder}
                            className="h-8 text-xs font-mono"
                            onChange={(event) =>
                              setSystemSettings((current) =>
                                current ? { ...current, [field]: event.target.value || null } : current
                              )
                            }
                          />

                          {/* Metadata row: last validated + version */}
                          {ts?.last_validated_at && (
                            <div className="flex items-center gap-4 mt-1.5">
                              <span className="font-mono text-[10px] text-muted-foreground flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                Validated: {new Date(ts.last_validated_at).toLocaleString()}
                              </span>
                              {ts.version && (
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  Version: {ts.version}
                                </span>
                              )}
                            </div>
                          )}

                          {/* YARA compile error detail */}
                          {ts?.detail && (
                            <p className="font-mono text-xs text-destructive mt-1">{ts.detail}</p>
                          )}

                          {/* EZ Tools per-DLL breakdown */}
                          {key === "ez_tools" && ts?.dlls && (
                            <div className="mt-2 pt-2 border-t border-border/20">
                              <div className="font-mono text-[9px] text-muted-foreground uppercase tracking-widest mb-1.5">Parser DLL Status</div>
                              <div className="grid grid-cols-3 gap-x-4 gap-y-1">
                                {Object.entries(ts.dlls).map(([name, info]) => (
                                  <span key={name} className={`flex items-center gap-1 font-mono text-[10px] ${info.found ? "text-green-400/80" : "text-muted-foreground/50"}`}>
                                    {info.found
                                      ? <CheckCircle2 className="w-3 h-3 shrink-0" />
                                      : <XCircle className="w-3 h-3 shrink-0 text-red-400/50" />
                                    }
                                    {name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Timesketch */}
                    <div className="space-y-1 mb-3">
                      <FormLabel className="text-muted-foreground uppercase">Timesketch URL</FormLabel>
                      <Input
                        value={systemSettings?.timesketch_url ?? ""}
                        placeholder="http://timesketch:5000"
                        className="h-8 text-xs font-mono"
                        onChange={(event) =>
                          setSystemSettings((current) =>
                            current ? { ...current, timesketch_url: event.target.value || null } : current
                          )
                        }
                      />
                    </div>

                    {/* Auto-process + Validate All row */}
                    <div className="flex items-center justify-between pt-3 border-t border-border">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="auto_process"
                          checked={systemSettings?.auto_process ?? false}
                          onChange={(event) =>
                            setSystemSettings((current) =>
                              current ? { ...current, auto_process: event.target.checked } : current
                            )
                          }
                          className="w-4 h-4 accent-primary"
                        />
                        <label htmlFor="auto_process" className="font-mono text-xs text-muted-foreground uppercase cursor-pointer">
                          Auto-trigger pipeline after evidence upload completes
                        </label>
                      </div>
                      <Button
                        variant="secondary"
                        disabled={isVerifyingTools || validatingTool !== null}
                        onClick={async () => {
                          setIsVerifyingTools(true);
                          try {
                            const result = await apiPost<Record<string, ToolResult>>(
                              "/settings/verify-tools",
                              {}
                            );
                            setToolStatus(result);
                          } catch {
                            setErrorMessage("Failed to verify tools.");
                          } finally {
                            setIsVerifyingTools(false);
                          }
                        }}
                      >
                        <RefreshCw className={`w-4 h-4 mr-2 ${isVerifyingTools ? "animate-spin" : ""}`} />
                        {isVerifyingTools ? "VERIFYING ALL..." : "VALIDATE ALL TOOLS"}
                      </Button>
                    </div>
                  </TacticalPanel>
                </div>

                 <div className="flex justify-end gap-4 mt-6">
                   <Button variant="secondary" onClick={loadAdminData}>RESET TO DEFAULTS</Button>
                    <Button
                      variant="tactical"
                      onClick={async () => {
                        if (!systemSettings) return;
                        setIsSavingSettings(true);
                        setErrorMessage(null);
                        try {
                          const updated = await apiPut<SystemSettingsResponse>("/settings", systemSettings);
                          setSystemSettings(updated);
                          await loadAdminData();
                        } catch {
                          setErrorMessage("Unable to save system settings.");
                        } finally {
                          setIsSavingSettings(false);
                        }
                      }}
                      disabled={isSavingSettings}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {isSavingSettings ? "SAVING" : "SAVE CONFIGURATION"}
                    </Button>
                  </div>

              </>
            )}

            {/* Audit Logs Tab */}
            {activeTab === "audit" && (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
                    Audit Log Entries ({auditTotal})
                  </h2>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => void exportAuditLogs()}>
                      <Download className="w-4 h-4 mr-2" />
                      EXPORT CSV
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => void loadAuditLogs()}>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      REFRESH
                    </Button>
                  </div>
                </div>

                {/* Filter row 1: text filters */}
                <div className="grid grid-cols-3 gap-3">
                  <SearchInput
                    value={auditEventType}
                    onChange={(event) => { setAuditEventType(event.target.value); setAuditPage(1); }}
                    placeholder="Filter event_type…"
                  />
                  <SearchInput
                    value={auditActorId}
                    onChange={(event) => { setAuditActorId(event.target.value); setAuditPage(1); }}
                    placeholder="Filter actor…"
                  />
                  <SearchInput
                    value={auditTargetId}
                    onChange={(event) => { setAuditTargetId(event.target.value); setAuditPage(1); }}
                    placeholder="Filter target…"
                  />
                </div>

                {/* Filter row 2: date range + status chips */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <input
                      type="date"
                      value={auditDateFrom}
                      onChange={(e) => { setAuditDateFrom(e.target.value); setAuditPage(1); }}
                      className="h-8 px-2 bg-secondary border border-border font-mono text-xs text-foreground focus:outline-none focus:border-primary"
                    />
                    <span className="font-mono text-xs text-muted-foreground">to</span>
                    <input
                      type="date"
                      value={auditDateTo}
                      onChange={(e) => { setAuditDateTo(e.target.value); setAuditPage(1); }}
                      className="h-8 px-2 bg-secondary border border-border font-mono text-xs text-foreground focus:outline-none focus:border-primary"
                    />
                    {(auditDateFrom || auditDateTo) && (
                      <button
                        onClick={() => { setAuditDateFrom(""); setAuditDateTo(""); setAuditPage(1); }}
                        className="font-mono text-[10px] text-muted-foreground hover:text-foreground px-1"
                      >
                        CLEAR
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-auto">
                    {(["all", "success", "failure"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => { setAuditStatusFilter(s); setAuditPage(1); }}
                        className={`px-3 py-1 border font-mono text-[10px] uppercase transition-colors ${
                          auditStatusFilter === s
                            ? s === "success" ? "border-green-500/50 bg-green-500/15 text-green-400"
                              : s === "failure" ? "border-red-500/50 bg-red-500/15 text-red-400"
                              : "border-primary/50 bg-primary/10 text-primary"
                            : "border-border/50 bg-secondary/30 text-muted-foreground hover:border-primary/30"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <TacticalPanel
                  title="AUDIT LOG"
                  status="locked"
                  className="flex-1 overflow-hidden flex flex-col"
                  headerActions={
                    <span className="font-mono text-xs text-muted-foreground">
                      {auditTotal} ENTRIES
                    </span>
                  }
                >
                  <div className="flex-1 overflow-auto">
                    <TableHeaderRow className="grid grid-cols-12 gap-3 sticky top-0 bg-card">
                      <div className="col-span-2">Timestamp</div>
                      <div className="col-span-2">Event</div>
                      <div className="col-span-2">Actor</div>
                      <div className="col-span-2">Action</div>
                      <div className="col-span-2">Target</div>
                      <div className="col-span-1">Status</div>
                      <div className="col-span-1"></div>
                    </TableHeaderRow>

                    {auditLogs.length === 0 ? (
                      <div className="py-10 text-center font-mono text-xs text-muted-foreground">
                        No audit log entries match the current filters.
                      </div>
                    ) : auditLogs.map((entry) => {
                      const isExpanded = auditExpandedId === entry.id;
                      const statusClass = entry.status === "success"
                        ? "text-green-400 border-green-400/30 bg-green-400/10"
                        : entry.status === "failure"
                          ? "text-red-400 border-red-400/30 bg-red-400/10"
                          : "text-muted-foreground border-border bg-secondary";
                      return (
                        <div key={entry.id}>
                          <div
                            className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-border/50 hover:bg-secondary/20 transition-colors cursor-pointer"
                            onClick={() => setAuditExpandedId(isExpanded ? null : entry.id)}
                          >
                            <div className="col-span-2 font-mono text-xs text-muted-foreground">
                              <div>{new Date(entry.timestamp).toLocaleDateString()}</div>
                              <div className="text-[10px]">
                                {new Date(entry.timestamp).toLocaleTimeString("en-US", { hour12: false })}
                              </div>
                            </div>
                            <div className="col-span-2 font-mono text-xs text-primary truncate">
                              {entry.event_type}
                            </div>
                            <div className="col-span-2 font-mono text-xs font-medium truncate">
                              {entry.actor_id}
                            </div>
                            <div className="col-span-2 font-mono text-xs text-muted-foreground truncate">
                              {entry.action}
                            </div>
                            <div className="col-span-2 font-mono text-xs text-muted-foreground truncate">
                              {entry.target_id ?? "—"}
                            </div>
                            <div className="col-span-1">
                              <span className={`px-1.5 py-0.5 border font-mono text-[10px] uppercase rounded-sm ${statusClass}`}>
                                {entry.status}
                              </span>
                            </div>
                            <div className="col-span-1 text-right font-mono text-[10px] text-muted-foreground">
                              {isExpanded ? "▲" : "▼"}
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="px-4 py-3 border-b border-primary/20 bg-primary/[0.03] space-y-2">
                              <div className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs">
                                <div><span className="text-muted-foreground">SOURCE:</span> <span className="text-foreground">{entry.source}</span></div>
                                <div><span className="text-muted-foreground">ACTOR TYPE:</span> <span className="text-foreground">{entry.actor_type}</span></div>
                                <div><span className="text-muted-foreground">TARGET TYPE:</span> <span className="text-foreground">{entry.target_type ?? "—"}</span></div>
                                <div><span className="text-muted-foreground">EVENT ID:</span> <span className="text-foreground">{entry.event_id}</span></div>
                              </div>
                              <div className="font-mono text-xs">
                                <span className="text-muted-foreground">MESSAGE: </span>
                                <span className="text-foreground">{entry.message}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <TablePagination
                    currentPage={auditPage}
                    totalPages={auditTotalPages}
                    totalItems={auditTotal}
                    itemsPerPage={auditItemsPerPage}
                    onPageChange={setAuditPage}
                    onItemsPerPageChange={(value) => {
                      setAuditItemsPerPage(value);
                      setAuditPage(1);
                    }}
                  />
                </TacticalPanel>
              </>
            )}

            {/* Threat Intel Tab */}
            {activeTab === "threatintel" && (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
                    IOC Indicators ({iocTotal})
                  </h2>
                  <Button variant="secondary" onClick={loadIOCIndicators}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    REFRESH
                  </Button>
                </div>

                {/* Add IOC Form */}
                <TacticalPanel title="ADD INDICATOR">
                  <div className="grid grid-cols-12 gap-3 items-end">
                    <div className="col-span-2 space-y-1">
                      <FormLabel className="text-muted-foreground uppercase text-[10px]">TYPE</FormLabel>
                      <select
                        value={newIoc.ioc_type}
                        onChange={(e) => setNewIoc({ ...newIoc, ioc_type: e.target.value })}
                        className="w-full h-9 bg-background border border-border rounded-sm px-2 font-mono text-xs text-foreground"
                      >
                        {["ip", "domain", "sha256", "md5", "sha1"].map((t) => (
                          <option key={t} value={t}>{t.toUpperCase()}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-4 space-y-1">
                      <FormLabel className="text-muted-foreground uppercase text-[10px]">VALUE</FormLabel>
                      <Input
                        value={newIoc.value}
                        onChange={(e) => setNewIoc({ ...newIoc, value: e.target.value })}
                        placeholder="e.g. 192.168.1.1 or domain.com"
                        className="font-mono text-xs"
                        onKeyDown={(e) => { if (e.key === "Enter") handleAddIOC(); }}
                      />
                    </div>
                    <div className="col-span-3 space-y-1">
                      <FormLabel className="text-muted-foreground uppercase text-[10px]">DESCRIPTION</FormLabel>
                      <Input
                        value={newIoc.description}
                        onChange={(e) => setNewIoc({ ...newIoc, description: e.target.value })}
                        placeholder="Optional description"
                        className="font-mono text-xs"
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <FormLabel className="text-muted-foreground uppercase text-[10px]">SEVERITY</FormLabel>
                      <select
                        value={newIoc.severity}
                        onChange={(e) => setNewIoc({ ...newIoc, severity: e.target.value })}
                        className="w-full h-9 bg-background border border-border rounded-sm px-2 font-mono text-xs text-foreground"
                      >
                        {["critical", "high", "medium", "low"].map((s) => (
                          <option key={s} value={s}>{s.toUpperCase()}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-1">
                      <Button
                        variant="tactical"
                        className="w-full"
                        onClick={handleAddIOC}
                        disabled={isAddingIoc}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </TacticalPanel>

                {/* IOC Type Filter */}
                <div className="flex flex-wrap gap-2 font-mono text-xs">
                  {["all", "ip", "domain", "sha256", "md5", "sha1"].map((t) => (
                    <button
                      key={t}
                      onClick={() => setIocTypeFilter(t)}
                      className={`px-3 py-1.5 border rounded-sm uppercase transition-colors ${
                        iocTypeFilter === t
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                {/* IOC Table */}
                <TacticalPanel title="INDICATOR DATABASE">
                  {iocIndicators.length === 0 ? (
                    <div className="py-8 text-center font-mono text-xs text-muted-foreground">
                      No IOC indicators configured. Add threat intelligence above.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full font-mono text-xs">
                        <thead>
                          <tr className="border-b border-border text-muted-foreground">
                            <th className="px-3 py-2 text-left font-normal uppercase">TYPE</th>
                            <th className="px-3 py-2 text-left font-normal uppercase">VALUE</th>
                            <th className="px-3 py-2 text-left font-normal uppercase">DESCRIPTION</th>
                            <th className="px-3 py-2 text-left font-normal uppercase">SEVERITY</th>
                            <th className="px-3 py-2 text-left font-normal uppercase">ADDED BY</th>
                            <th className="px-3 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {iocIndicators.map((ind) => (
                            <tr key={ind.id} className="border-b border-border/40 hover:bg-secondary/30">
                              <td className="px-3 py-2 text-primary uppercase">{ind.ioc_type}</td>
                              <td className="px-3 py-2 font-bold text-foreground max-w-[200px] truncate">
                                {ind.value}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">
                                {ind.description ?? "—"}
                              </td>
                              <td className="px-3 py-2">
                                <span className={`px-1.5 py-0.5 border rounded-sm uppercase text-[10px] ${
                                  ind.severity === "critical" ? "text-red-400 border-red-400/30 bg-red-400/10"
                                  : ind.severity === "high" ? "text-orange-400 border-orange-400/30 bg-orange-400/10"
                                  : ind.severity === "medium" ? "text-yellow-400 border-yellow-400/30 bg-yellow-400/10"
                                  : "text-blue-400 border-blue-400/30 bg-blue-400/10"
                                }`}>
                                  {ind.severity}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">{ind.created_by}</td>
                              <td className="px-3 py-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteIOC(ind.id)}
                                  title="Remove indicator"
                                >
                                  <Trash2 className="w-3 h-3 text-destructive" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TacticalPanel>
              </>
            )}

            {/* AI Config Tab */}
            {activeTab === "ai" && (() => {
              const providerInfo = AI_PROVIDERS.find(p => p.id === aiProvider)!;
              return (
                <>
                  <div className="flex items-center justify-between">
                    <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
                      AI / LLM Configuration
                    </h2>
                  </div>

                  {aiMessage && (
                    <div className={`flex items-center gap-2 p-3 border rounded-sm font-mono text-xs ${
                      aiMessage.ok ? "border-primary/40 bg-primary/5 text-primary" : "border-destructive/40 bg-destructive/5 text-destructive"
                    }`}>
                      {aiMessage.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                      {aiMessage.text}
                    </div>
                  )}

                  {isConnectingGoogle && (
                    <div className="flex items-center gap-2 p-3 border border-primary/30 bg-primary/5 rounded-sm font-mono text-xs text-primary animate-pulse">
                      <CircleDashed className="w-4 h-4 animate-spin shrink-0" />
                      Completing Google OAuth flow...
                    </div>
                  )}

                  {/* Provider Selection */}
                  <TacticalPanel title="PROVIDER" status="active">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                      {AI_PROVIDERS.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setAiProvider(p.id);
                            setAiModel(p.defaultModel);
                            setAiApiUrl(p.defaultUrl);
                            setAiMessage(null);
                          }}
                          className={`flex flex-col items-center gap-1.5 p-3 border rounded-sm font-mono text-xs transition-colors ${
                            aiProvider === p.id
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                          }`}
                        >
                          <Brain className={`w-5 h-5 ${aiProvider === p.id ? "text-primary" : "text-muted-foreground"}`} />
                          <span className="font-bold text-center leading-tight">{p.label}</span>
                          {p.hasOAuth && (
                            <span className="text-[9px] px-1 border border-primary/30 rounded text-primary/80">OAuth</span>
                          )}
                        </button>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground font-mono">{providerInfo.note}</p>
                  </TacticalPanel>

                  {/* Model & URL Config */}
                  <TacticalPanel title="MODEL CONFIGURATION" status="active">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <FormLabel className="text-[10px] text-muted-foreground uppercase">Model Name</FormLabel>
                        <Input
                          className="font-mono text-xs"
                          value={aiModel}
                          onChange={(e) => setAiModel(e.target.value)}
                          placeholder={providerInfo.defaultModel}
                        />
                        <p className="text-[10px] text-muted-foreground">Default: {providerInfo.defaultModel}</p>
                      </div>
                      <div className="space-y-1.5">
                        <FormLabel className="text-[10px] text-muted-foreground uppercase">API Base URL</FormLabel>
                        <Input
                          className="font-mono text-xs"
                          value={aiApiUrl}
                          onChange={(e) => setAiApiUrl(e.target.value)}
                          placeholder={providerInfo.defaultUrl}
                        />
                        <p className="text-[10px] text-muted-foreground">Leave blank to use default</p>
                      </div>
                    </div>
                  </TacticalPanel>

                  {/* Authentication */}
                  <TacticalPanel title="AUTHENTICATION" status={googleConnected && aiProvider === "gemini" ? "online" : "active"}>
                    {aiProvider === "gemini" ? (
                      <div className="space-y-4">
                        {/* Option A: OAuth */}
                        <div className="border border-primary/20 rounded-sm p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold uppercase text-primary">Option A — Google OAuth (Recommended)</span>
                            {googleConnected && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 border border-primary/30 text-primary rounded">CONNECTED</span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground leading-relaxed">
                            Connect your Google account using OAuth 2.0 PKCE. Your DFIR Kit will use your Google identity to call the Gemini API.
                            Requires a Google Cloud project with the Generative Language API enabled and an OAuth 2.0 Web App client.
                            <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="ml-1 text-primary hover:underline inline-flex items-center gap-0.5">
                              Create credentials <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <FormLabel className="text-[10px] text-muted-foreground uppercase">Google OAuth Client ID</FormLabel>
                              <Input
                                className="font-mono text-xs"
                                value={googleClientId}
                                onChange={(e) => setGoogleClientId(e.target.value)}
                                placeholder="1234567890-xxx.apps.googleusercontent.com"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <FormLabel className="text-[10px] text-muted-foreground uppercase">Client Secret</FormLabel>
                              <div className="relative">
                                <Input
                                  type={googleShowSecret ? "text" : "password"}
                                  className="font-mono text-xs pr-8"
                                  value={googleClientSecret}
                                  onChange={(e) => setGoogleClientSecret(e.target.value)}
                                  placeholder={googleClientSecret === "***" ? "Saved (hidden)" : "GOCSPX-xxx..."}
                                />
                                <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setGoogleShowSecret(v => !v)}>
                                  {googleShowSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {googleConnected ? (
                              <Button variant="outline" size="sm" className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/10 text-xs" onClick={() => void handleGoogleDisconnect()}>
                                <Unlink2 className="w-3.5 h-3.5" />
                                DISCONNECT GOOGLE
                              </Button>
                            ) : (
                              <Button variant="tactical" size="sm" className="gap-2 text-xs" disabled={!googleClientId || isConnectingGoogle} onClick={() => void handleGoogleConnect()}>
                                <Link2 className="w-3.5 h-3.5" />
                                CONNECT WITH GOOGLE
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Option B: API Key */}
                        <div className="border border-border/40 rounded-sm p-4 space-y-3">
                          <span className="font-mono text-xs font-bold uppercase text-muted-foreground">Option B — Gemini API Key</span>
                          <p className="text-[10px] text-muted-foreground leading-relaxed">
                            Use a Google AI Studio API key instead of OAuth.
                            <a href={providerInfo.apiKeyLink} target="_blank" rel="noopener noreferrer" className="ml-1 text-primary hover:underline inline-flex items-center gap-0.5">
                              Get key from AI Studio <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </p>
                          <div className="space-y-1.5">
                            <FormLabel className="text-[10px] text-muted-foreground uppercase">Gemini API Key</FormLabel>
                            <div className="relative">
                              <Input
                                type={aiShowKey ? "text" : "password"}
                                className="font-mono text-xs pr-8"
                                value={aiApiKey}
                                onChange={(e) => setAiApiKey(e.target.value)}
                                placeholder={aiApiKey === "***" ? "Saved (hidden)" : "AIza..."}
                              />
                              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setAiShowKey(v => !v)}>
                                {aiShowKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : aiProvider === "ollama" ? (
                      <div className="p-3 border border-primary/20 bg-primary/5 rounded-sm font-mono text-xs text-primary">
                        No API key required — Ollama runs locally. Ensure Ollama is running at the URL above.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-start gap-3 p-3 border border-border/40 bg-secondary/10 rounded-sm">
                          <Key className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                          <div className="space-y-1">
                            <p className="font-mono text-xs text-muted-foreground leading-relaxed">
                              {aiProvider === "openai" && "OpenAI does not support OAuth for direct API access. Use an API key from your OpenAI account."}
                              {aiProvider === "anthropic" && "Anthropic does not support OAuth for direct API access. Use an API key from your Anthropic Console."}
                              {aiProvider === "openrouter" && "OpenRouter uses API keys for authentication."}
                            </p>
                            {providerInfo.apiKeyLink && (
                              <a href={providerInfo.apiKeyLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                                Get API key <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <FormLabel className="text-[10px] text-muted-foreground uppercase">API Key</FormLabel>
                          <div className="relative">
                            <Input
                              type={aiShowKey ? "text" : "password"}
                              className="font-mono text-xs pr-8"
                              value={aiApiKey}
                              onChange={(e) => setAiApiKey(e.target.value)}
                              placeholder={aiApiKey === "***" ? "Saved (hidden)" : `${aiProvider === "openai" ? "sk-..." : aiProvider === "anthropic" ? "sk-ant-..." : "Enter API key..."}`}
                            />
                            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setAiShowKey(v => !v)}>
                              {aiShowKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </TacticalPanel>

                  <div className="flex justify-end">
                    <Button variant="tactical" size="sm" className="gap-2" disabled={isSavingAi} onClick={() => void handleSaveAiConfig()}>
                      <Save className="w-4 h-4" />
                      {isSavingAi ? "SAVING..." : "SAVE AI CONFIG"}
                    </Button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>
      <Dialog open={showAddUser} onOpenChange={handleAddUserDialogChange}>
        <DialogContent className="max-w-xl bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-mono text-lg tracking-wider">ADD USER</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <FormLabel className="text-muted-foreground uppercase">Username</FormLabel>
              <Input
                value={newUser.username}
                onChange={(event) =>
                  setNewUser({ ...newUser, username: event.target.value })
                }
                placeholder="Enter username"
              />
            </div>
            <div className="space-y-2">
              <FormLabel className="text-muted-foreground uppercase">Password</FormLabel>
              <div className="relative">
                <Input
                  type={showNewPassword ? "text" : "password"}
                  value={newUser.password}
                  onChange={(event) =>
                    setNewUser({ ...newUser, password: event.target.value })
                  }
                  placeholder="Min 8 characters"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {newUser.password && (() => {
                const s = pwStrength(newUser.password);
                return (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${PW_COLOR[s]}`} style={{ width: `${(s / 3) * 100}%` }} />
                    </div>
                    <span className={`font-mono text-[10px] ${s === 3 ? "text-green-400" : s === 2 ? "text-yellow-400" : "text-destructive"}`}>
                      {PW_LABEL[s]}
                    </span>
                  </div>
                );
              })()}
            </div>
            <div className="space-y-2">
              <FormLabel className="text-muted-foreground uppercase">Role</FormLabel>
              <div className="flex gap-2">
                {(["operator", "viewer", "admin"] as const).map((role) => (
                  <SelectableButton
                    key={role}
                    isActive={newUser.role === role}
                    onClick={() => setNewUser({ ...newUser, role })}
                    className="flex-1 p-2"
                    activeClassName={getRoleColor(role)}
                    inactiveClassName="border-border bg-secondary text-muted-foreground"
                  >
                    {role}
                  </SelectableButton>
                ))}
              </div>
            </div>
            <div className="flex gap-3 pt-4 border-t border-border">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => handleAddUserDialogChange(false)}
              >
                CANCEL
              </Button>
              <Button
                variant="tactical"
                className="flex-1"
                onClick={handleAddUser}
              >
                SAVE USER
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={isEditUserOpen} onOpenChange={handleEditDialogChange}>
        <DialogContent className="max-w-xl bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-mono text-lg tracking-wider">EDIT USER</DialogTitle>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-5">
              <div className="space-y-2">
                <FormLabel className="text-muted-foreground uppercase">
                  Username
                </FormLabel>
                <Input value={editingUser.username} disabled />
              </div>
              <div className="space-y-2">
                <FormLabel className="text-muted-foreground uppercase">
                  Role
                </FormLabel>
                <div className="flex gap-2">
                  {(["operator", "viewer", "admin"] as const).map((role) => (
                    <button
                      key={role}
                      onClick={() => setEditUserRole(role)}
                      className={`flex-1 p-2 border font-mono text-xs uppercase transition-all ${
                        editUserRole === role
                          ? getRoleColor(role)
                          : "border-border bg-secondary text-muted-foreground"
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <FormLabel className="text-muted-foreground uppercase">
                  Status
                </FormLabel>
                <div className="flex gap-2">
                  {(["active", "inactive", "locked"] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => setEditUserStatus(status)}
                      className={`flex-1 p-2 border font-mono text-xs uppercase transition-all ${
                        editUserStatus === status
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-border bg-secondary text-muted-foreground"
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <FormLabel className="text-muted-foreground uppercase flex items-center gap-2">
                  <Key className="w-3.5 h-3.5" />
                  Reset Password
                  <span className="text-[10px] text-muted-foreground font-normal normal-case">(leave blank to keep unchanged)</span>
                </FormLabel>
                <div className="relative">
                  <Input
                    type={showEditPassword ? "text" : "password"}
                    value={editUserPassword}
                    onChange={(e) => setEditUserPassword(e.target.value)}
                    placeholder="New password…"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {editUserPassword && (() => {
                  const s = pwStrength(editUserPassword);
                  return (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${PW_COLOR[s]}`} style={{ width: `${(s / 3) * 100}%` }} />
                      </div>
                      <span className={`font-mono text-[10px] ${s === 3 ? "text-green-400" : s === 2 ? "text-yellow-400" : "text-destructive"}`}>
                        {PW_LABEL[s]}
                      </span>
                    </div>
                  );
                })()}
              </div>
              <div className="flex gap-3 pt-4 border-t border-border">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => handleEditDialogChange(false)}
                  disabled={isSavingUser}
                >
                  CANCEL
                </Button>
                <Button
                  variant="tactical"
                  className="flex-1"
                  onClick={handleSaveUser}
                  disabled={isSavingUser}
                >
                  {isSavingUser ? "SAVING" : "SAVE CHANGES"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

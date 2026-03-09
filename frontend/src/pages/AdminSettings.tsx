import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
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

type TabType = "users" | "collectors" | "system" | "audit" | "threatintel";

export default function AdminSettings() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>("users");
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [isRefreshingCollectors, setIsRefreshingCollectors] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditEventType, setAuditEventType] = useState("");
  const [auditActorId, setAuditActorId] = useState("");
  const [auditTargetId, setAuditTargetId] = useState("");
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditItemsPerPage, setAuditItemsPerPage] = useState(25);
  const [iocIndicators, setIocIndicators] = useState<IOCIndicator[]>([]);
  const [iocTypeFilter, setIocTypeFilter] = useState("all");
  const [iocTotal, setIocTotal] = useState(0);
  const [newIoc, setNewIoc] = useState({ ioc_type: "ip", value: "", description: "", severity: "high" });
  const [isAddingIoc, setIsAddingIoc] = useState(false);
  const [toolStatus, setToolStatus] = useState<Record<string, { ok: boolean; status: string; path: string | null }> | null>(null);
  const [isVerifyingTools, setIsVerifyingTools] = useState(false);

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

  const loadAdminData = async () => {
    setErrorMessage(null);
    await Promise.all([
      usersQuery.refetch(),
      collectorsQuery.refetch(),
      settingsQuery.refetch(),
    ]);
  };

  const loadAuditLogs = async () => {
    setErrorMessage(null);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(auditItemsPerPage));
      params.set("offset", String((auditPage - 1) * auditItemsPerPage));
      if (auditEventType.trim()) params.set("event_type", auditEventType.trim());
      if (auditActorId.trim()) params.set("actor_id", auditActorId.trim());
      if (auditTargetId.trim()) params.set("target_id", auditTargetId.trim());
      const response = await apiGet<AuditLogListResponse>(`/audit-logs?${params.toString()}`);
      setAuditLogs(response.entries);
      setAuditTotal(response.total);
    } catch {
      setErrorMessage("Unable to load audit log entries.");
    }
  };

  useEffect(() => {
    if (activeTab !== "audit") return;
    loadAuditLogs();
  }, [activeTab, auditPage, auditItemsPerPage, auditEventType, auditActorId, auditTargetId]);

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
    loadAdminData();
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
      const updated = await apiPatch<UserResponse>(`/users/${editingUser.id}`, {
        role: editUserRole,
        status: editUserStatus,
      });
      const mapped = mapUser(updated);
      setUsers(users.map((user) => (user.id === mapped.id ? mapped : user)));
      setIsEditUserOpen(false);
      setEditingUser(null);
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
                      paginatedUsers.map((user) => (
                        <div
                          key={user.id}
                          className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-border/50 hover:bg-secondary/30 transition-colors items-center"
                        >
                          <div className="col-span-3 font-mono text-sm font-bold">
                            {user.username}
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
                          <div className="col-span-3 flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Edit User"
                              onClick={() => openEditUserDialog(user)}
                            >
                              <Edit2 className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleUserStatus(user.id)}
                              title={user.status === "active" ? "Lock User" : "Unlock User"}
                            >
                              <Power
                                className={`w-3 h-3 ${
                                  user.status === "active"
                                    ? "text-primary"
                                    : "text-warning"
                                }`}
                              />
                            </Button>
                            {user.role !== "admin" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteUser(user.id)}
                                title="Delete User"
                              >
                                <Trash2 className="w-3 h-3 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))
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

                  {/* Forensics Pipeline Settings */}
                  <TacticalPanel title="FORENSICS PIPELINE" className="col-span-2">
                    {/* Info banner */}
                    <div className="mb-4 p-3 rounded border border-yellow-500/30 bg-yellow-500/5 font-mono text-xs text-yellow-400">
                      Tools are NOT bundled in the Docker image. Install each tool on the server (or mount via Docker volume),
                      then enter the path below and click VERIFY to confirm accessibility.
                    </div>

                    {/* Tool path rows */}
                    {([
                      { key: "ez_tools", label: "EZ Tools Directory", field: "ez_tools_path" as const, placeholder: "/opt/eztools", isDir: true },
                      { key: "chainsaw", label: "Chainsaw Binary", field: "chainsaw_path" as const, placeholder: "/opt/chainsaw/chainsaw", isDir: false },
                      { key: "hayabusa", label: "Hayabusa Binary", field: "hayabusa_path" as const, placeholder: "/opt/hayabusa/hayabusa", isDir: false },
                      { key: "sigma_rules", label: "Sigma Rules Directory", field: "sigma_rules_path" as const, placeholder: "/opt/sigma-rules", isDir: true },
                      { key: "yara_rules", label: "YARA Rules Directory", field: "yara_rules_path" as const, placeholder: "/opt/yara-rules", isDir: true },
                    ] as const).map(({ key, label, field, placeholder }) => {
                      const ts = toolStatus?.[key];
                      return (
                        <div key={key} className="grid grid-cols-[1fr_auto] gap-2 items-end mb-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <FormLabel className="text-muted-foreground uppercase">{label}</FormLabel>
                              {ts && (
                                <span className={`flex items-center gap-1 font-mono text-xs ${ts.ok ? "text-green-400" : "text-red-400"}`}>
                                  {ts.ok
                                    ? <><CheckCircle2 className="w-3 h-3" /> FOUND</>
                                    : ts.status === "not_configured"
                                      ? <><CircleDashed className="w-3 h-3 text-muted-foreground" /><span className="text-muted-foreground">NOT CONFIGURED</span></>
                                      : ts.status === "not_executable"
                                        ? <><XCircle className="w-3 h-3" /> NOT EXECUTABLE</>
                                        : <><XCircle className="w-3 h-3" /> NOT FOUND</>
                                  }
                                </span>
                              )}
                            </div>
                            <Input
                              value={systemSettings?.[field] ?? ""}
                              placeholder={placeholder}
                              onChange={(event) =>
                                setSystemSettings((current) =>
                                  current ? { ...current, [field]: event.target.value || null } : current
                                )
                              }
                            />
                          </div>
                        </div>
                      );
                    })}

                    {/* Timesketch */}
                    <div className="space-y-1 mb-3">
                      <FormLabel className="text-muted-foreground uppercase">Timesketch URL</FormLabel>
                      <Input
                        value={systemSettings?.timesketch_url ?? ""}
                        placeholder="http://timesketch:5000"
                        onChange={(event) =>
                          setSystemSettings((current) =>
                            current ? { ...current, timesketch_url: event.target.value || null } : current
                          )
                        }
                      />
                    </div>

                    {/* Auto-process + Verify row */}
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
                        disabled={isVerifyingTools}
                        onClick={async () => {
                          setIsVerifyingTools(true);
                          try {
                            const result = await apiPost<Record<string, { ok: boolean; status: string; path: string | null }>>(
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
                        {isVerifyingTools ? "VERIFYING..." : "VERIFY TOOLS"}
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
                  <Button variant="secondary" onClick={loadAuditLogs}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    REFRESH
                  </Button>
                </div>

                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-4">
                    <SearchInput
                      value={auditEventType}
                      onChange={(event) => {
                        setAuditEventType(event.target.value);
                        setAuditPage(1);
                      }}
                      placeholder="Filter event_type..."
                    />
                  </div>
                  <div className="col-span-4">
                    <SearchInput
                      value={auditActorId}
                      onChange={(event) => {
                        setAuditActorId(event.target.value);
                        setAuditPage(1);
                      }}
                      placeholder="Filter actor_id..."
                    />
                  </div>
                  <div className="col-span-4">
                    <SearchInput
                      value={auditTargetId}
                      onChange={(event) => {
                        setAuditTargetId(event.target.value);
                        setAuditPage(1);
                      }}
                      placeholder="Filter target_id..."
                    />
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
                    <TableHeaderRow className="grid grid-cols-12 gap-4 sticky top-0 bg-card">
                      <div className="col-span-3">Timestamp</div>
                      <div className="col-span-2">Event</div>
                      <div className="col-span-2">Actor</div>
                      <div className="col-span-2">Action</div>
                      <div className="col-span-2">Target</div>
                      <div className="col-span-1">Status</div>
                    </TableHeaderRow>

                    {auditLogs.map((entry) => (
                      <div
                        key={entry.id}
                        className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-border/50 hover:bg-secondary/30 transition-colors"
                      >
                        <div className="col-span-3 font-mono text-xs text-muted-foreground">
                          <div>{new Date(entry.timestamp).toLocaleDateString()}</div>
                          <div className="text-[10px]">
                            {new Date(entry.timestamp).toLocaleTimeString("en-US", {
                              hour12: false,
                            })}
                          </div>
                        </div>
                        <div className="col-span-2 font-mono text-xs text-primary">
                          {entry.event_type}
                        </div>
                        <div className="col-span-2 font-mono text-xs">
                          {entry.actor_id}
                        </div>
                        <div className="col-span-2 font-mono text-xs text-muted-foreground">
                          {entry.action}
                        </div>
                        <div className="col-span-2 font-mono text-xs text-muted-foreground">
                          {entry.target_id ?? "-"}
                        </div>
                        <div className="col-span-1 font-mono text-xs uppercase text-muted-foreground">
                          {entry.status}
                        </div>
                      </div>
                    ))}
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
              <Input
                type="password"
                value={newUser.password}
                onChange={(event) =>
                  setNewUser({ ...newUser, password: event.target.value })
                }
                placeholder="Enter password"
              />
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

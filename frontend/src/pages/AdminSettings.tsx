import { useEffect, useState } from "react";
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
import { SelectableButton } from "@/components/common/SelectableButton";
import {
  Users,
  Server,
  Settings,
  Plus,
  Trash2,
  Edit2,
  Save,
  X,
  UserPlus,
  Power,
  RefreshCw,
  Shield,
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


type TabType = "users" | "collectors" | "system";

export default function AdminSettings() {
  const [activeTab, setActiveTab] = useState<TabType>("users");
  const [users, setUsers] = useState<User[]>([]);
  const [collectors, setCollectors] = useState<CollectorConfig[]>([]);
  const [systemSettings, setSystemSettings] = useState<SystemSettingsResponse | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState<{ username: string; role: User["role"] }>({ username: "", role: "operator" });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isRefreshingCollectors, setIsRefreshingCollectors] = useState(false);

  const loadAdminData = async () => {
    setErrorMessage(null);
    try {
      const [usersData, collectorsData, settingsData] = await Promise.all([
        apiGet<UserResponse[]>("/users"),
        apiGet<CollectorResponse[]>("/collectors"),
        apiGet<SystemSettingsResponse | null>("/settings"),
      ]);
      setUsers(usersData.map(mapUser));
      setCollectors(collectorsData.map(mapCollector));
      setSystemSettings(settingsData);
    } catch {
      setErrorMessage("Unable to load admin configuration.");
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  const {
    paginatedItems: paginatedUsers,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    goToPage,
    setPerPage,
  } = usePagination(users);

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
    const user: User = {
      id: String(users.length + 1),
      username: newUser.username.toUpperCase(),
      role: newUser.role,
      status: "active",
      lastLogin: "-",
      createdAt: new Date().toISOString(),
    };
    try {
      await apiPost("/users", {
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status,
        last_login: user.lastLogin,
        created_at: user.createdAt,
        password: "password",
      });
      setUsers([...users, user]);
      setNewUser({ username: "", role: "operator" });
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
    const updated = {
      ...target,
      status: target.status === "active" ? "locked" : "active",
    };
    try {
      await apiPatch(`/users/${updated.id}`, {
        status: updated.status,
      });
      setUsers(users.map((u) => (u.id === id ? updated : u)));
    } catch {
      setErrorMessage("Unable to update user status.");
    }
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: "users", label: "USER MANAGEMENT", icon: <Users className="w-4 h-4" /> },
    { id: "collectors", label: "COLLECTORS", icon: <Server className="w-4 h-4" /> },
    { id: "system", label: "SYSTEM CONFIG", icon: <Settings className="w-4 h-4" /> },
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
                    onClick={() => setShowAddUser(true)}
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    ADD USER
                  </Button>
                </div>

                {/* Add User Form */}
                {showAddUser && (
                  <TacticalPanel title="ADD NEW USER" status="active">
                    <div className="flex items-end gap-4">
                      <div className="flex-1 space-y-2">
                        <FormLabel className="text-muted-foreground uppercase">
                          Username
                        </FormLabel>
                        <Input
                          value={newUser.username}
                          onChange={(e) =>
                            setNewUser({ ...newUser, username: e.target.value })
                          }
                          placeholder="Enter username"
                        />
                      </div>
                      <div className="w-48 space-y-2">
                        <FormLabel className="text-muted-foreground uppercase">
                          Role
                        </FormLabel>
                        <div className="flex gap-2">
                          {(["operator", "viewer", "admin"] as const).map((role) => (
                            <button
                              key={role}
                              onClick={() => setNewUser({ ...newUser, role })}
                              className={`flex-1 p-2 border font-mono text-xs uppercase transition-all ${
                                newUser.role === role
                                  ? getRoleColor(role)
                                  : "border-border bg-secondary text-muted-foreground"
                              }`}
                            >
                              {role}
                            </button>
                          ))}
                        </div>
                      </div>
                      <Button variant="tactical" onClick={handleAddUser}>
                        <Save className="w-4 h-4 mr-2" />
                        SAVE
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setShowAddUser(false)}
                      >
                        <X className="w-4 h-4 mr-2" />
                        CANCEL
                      </Button>
                    </div>
                  </TacticalPanel>
                )}

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
                    {paginatedUsers.map((user) => (
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
                          <Button variant="ghost" size="sm" title="Edit User">
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
                    ))}
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
                      </div>
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
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

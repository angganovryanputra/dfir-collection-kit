import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TacticalPanel } from "@/components/TacticalPanel";
import { StatusIndicator } from "@/components/StatusIndicator";
import { WarningBanner } from "@/components/WarningBanner";
import {
  Shield,
  ArrowLeft,
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
} from "lucide-react";

interface User {
  id: string;
  username: string;
  role: "operator" | "viewer" | "admin";
  status: "active" | "inactive" | "locked";
  lastLogin: string;
  createdAt: string;
}

interface CollectorConfig {
  id: string;
  name: string;
  endpoint: string;
  status: "online" | "offline" | "maintenance";
  lastHeartbeat: string;
}

const mockUsers: User[] = [
  {
    id: "1",
    username: "J.SMITH",
    role: "operator",
    status: "active",
    lastLogin: "2025-01-09T10:30:00Z",
    createdAt: "2024-06-15T08:00:00Z",
  },
  {
    id: "2",
    username: "M.CHEN",
    role: "operator",
    status: "active",
    lastLogin: "2025-01-08T16:45:00Z",
    createdAt: "2024-07-20T10:00:00Z",
  },
  {
    id: "3",
    username: "K.JOHNSON",
    role: "viewer",
    status: "active",
    lastLogin: "2025-01-09T09:00:00Z",
    createdAt: "2024-09-01T14:00:00Z",
  },
  {
    id: "4",
    username: "ADMIN",
    role: "admin",
    status: "active",
    lastLogin: "2025-01-09T08:00:00Z",
    createdAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "5",
    username: "R.WILLIAMS",
    role: "operator",
    status: "locked",
    lastLogin: "2025-01-05T12:00:00Z",
    createdAt: "2024-08-10T09:00:00Z",
  },
];

const mockCollectors: CollectorConfig[] = [
  {
    id: "COL-01",
    name: "COLLECTOR-ALPHA",
    endpoint: "https://col-alpha.internal:8443",
    status: "online",
    lastHeartbeat: "2025-01-09T10:30:00Z",
  },
  {
    id: "COL-02",
    name: "COLLECTOR-BRAVO",
    endpoint: "https://col-bravo.internal:8443",
    status: "online",
    lastHeartbeat: "2025-01-09T10:30:00Z",
  },
  {
    id: "COL-03",
    name: "COLLECTOR-CHARLIE",
    endpoint: "https://col-charlie.internal:8443",
    status: "online",
    lastHeartbeat: "2025-01-09T10:28:00Z",
  },
  {
    id: "COL-04",
    name: "COLLECTOR-DELTA",
    endpoint: "https://col-delta.internal:8443",
    status: "offline",
    lastHeartbeat: "2025-01-09T08:15:00Z",
  },
];

type TabType = "users" | "collectors" | "system";

export default function AdminSettings() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>("users");
  const [users, setUsers] = useState<User[]>(mockUsers);
  const [collectors] = useState<CollectorConfig[]>(mockCollectors);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState<{ username: string; role: User["role"] }>({ username: "", role: "operator" });

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

  const handleAddUser = () => {
    if (newUser.username.trim()) {
      const user: User = {
        id: String(users.length + 1),
        username: newUser.username.toUpperCase(),
        role: newUser.role,
        status: "active",
        lastLogin: "-",
        createdAt: new Date().toISOString(),
      };
      setUsers([...users, user]);
      setNewUser({ username: "", role: "operator" });
      setShowAddUser(false);
    }
  };

  const handleDeleteUser = (id: string) => {
    setUsers(users.filter((u) => u.id !== id));
  };

  const handleToggleUserStatus = (id: string) => {
    setUsers(
      users.map((u) =>
        u.id === id
          ? { ...u, status: u.status === "active" ? "locked" : "active" }
          : u
      )
    );
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: "users", label: "USER MANAGEMENT", icon: <Users className="w-4 h-4" /> },
    { id: "collectors", label: "COLLECTORS", icon: <Server className="w-4 h-4" /> },
    { id: "system", label: "SYSTEM CONFIG", icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-background tactical-grid flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <Shield className="w-6 h-6 text-primary" />
            <div>
              <h1 className="font-mono text-lg font-bold tracking-wider text-foreground">
                ADMIN SETTINGS
              </h1>
              <p className="font-mono text-xs text-muted-foreground">
                SYSTEM CONFIGURATION & USER MANAGEMENT
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs text-destructive">
            <Shield className="w-4 h-4" />
            ADMIN ACCESS REQUIRED
          </div>
        </div>
      </header>

      {/* Warning */}
      <WarningBanner variant="warning">
        CHANGES TO SYSTEM CONFIGURATION MAY AFFECT ONGOING COLLECTIONS — PROCEED WITH CAUTION
      </WarningBanner>

      {/* Main Content */}
      <main className="flex-1 p-6 overflow-hidden">
        <div className="grid grid-cols-12 gap-6 h-full">
          {/* Sidebar Tabs */}
          <div className="col-span-3">
            <TacticalPanel title="CONFIGURATION" status="online">
              <div className="space-y-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 p-3 border font-mono text-xs uppercase tracking-wider transition-all text-left ${
                      activeTab === tab.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-secondary text-muted-foreground hover:border-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
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
                    <UserPlus className="w-4 h-4" />
                    ADD USER
                  </Button>
                </div>

                {/* Add User Form */}
                {showAddUser && (
                  <TacticalPanel title="ADD NEW USER" status="active">
                    <div className="flex items-end gap-4">
                      <div className="flex-1 space-y-2">
                        <label className="font-mono text-xs text-muted-foreground uppercase">
                          Username
                        </label>
                        <Input
                          value={newUser.username}
                          onChange={(e) =>
                            setNewUser({ ...newUser, username: e.target.value })
                          }
                          placeholder="Enter username"
                        />
                      </div>
                      <div className="w-48 space-y-2">
                        <label className="font-mono text-xs text-muted-foreground uppercase">
                          Role
                        </label>
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
                        <Save className="w-4 h-4" />
                        SAVE
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setShowAddUser(false)}
                      >
                        <X className="w-4 h-4" />
                        CANCEL
                      </Button>
                    </div>
                  </TacticalPanel>
                )}

                {/* Users Table */}
                <TacticalPanel title="USER ACCOUNTS">
                  <div className="space-y-0">
                    {/* Header */}
                    <div className="grid grid-cols-12 gap-4 px-4 py-3 font-mono text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                      <div className="col-span-3">Username</div>
                      <div className="col-span-2">Role</div>
                      <div className="col-span-2">Status</div>
                      <div className="col-span-2">Last Login</div>
                      <div className="col-span-3">Actions</div>
                    </div>

                    {/* Rows */}
                    {users.map((user) => (
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
                    <Button variant="secondary">
                      <RefreshCw className="w-4 h-4" />
                      REFRESH STATUS
                    </Button>
                    <Button variant="tactical">
                      <Plus className="w-4 h-4" />
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
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">ID:</span>
                            <span className="text-foreground">{collector.id}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">ENDPOINT:</span>
                            <span className="text-foreground text-xs">
                              {collector.endpoint}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">LAST HEARTBEAT:</span>
                            <span className="text-foreground">
                              {new Date(collector.lastHeartbeat).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="secondary" size="sm" className="flex-1">
                            <Edit2 className="w-3 h-3" />
                            CONFIGURE
                          </Button>
                          <Button
                            variant={collector.status === "online" ? "warning" : "tactical"}
                            size="sm"
                            className="flex-1"
                          >
                            <Power className="w-3 h-3" />
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
                  <TacticalPanel title="EVIDENCE VAULT SETTINGS">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="font-mono text-xs text-muted-foreground uppercase">
                          Storage Path
                        </label>
                        <Input
                          defaultValue="/var/dfir/evidence"
                          className="font-mono"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="font-mono text-xs text-muted-foreground uppercase">
                          Max Storage (GB)
                        </label>
                        <Input defaultValue="500" type="number" className="font-mono" />
                      </div>
                      <div className="space-y-2">
                        <label className="font-mono text-xs text-muted-foreground uppercase">
                          Hash Algorithm
                        </label>
                        <div className="flex gap-2">
                          {["SHA-256", "SHA-512", "MD5"].map((algo) => (
                            <button
                              key={algo}
                              className={`flex-1 p-2 border font-mono text-xs uppercase transition-all ${
                                algo === "SHA-256"
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border bg-secondary text-muted-foreground hover:border-muted-foreground"
                              }`}
                            >
                              {algo}
                            </button>
                          ))}
                        </div>
                      </div>
                      <Button variant="tactical" className="w-full">
                        <Save className="w-4 h-4" />
                        SAVE CHANGES
                      </Button>
                    </div>
                  </TacticalPanel>

                  <TacticalPanel title="COLLECTION SETTINGS">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="font-mono text-xs text-muted-foreground uppercase">
                          Default Timeout (seconds)
                        </label>
                        <Input defaultValue="3600" type="number" className="font-mono" />
                      </div>
                      <div className="space-y-2">
                        <label className="font-mono text-xs text-muted-foreground uppercase">
                          Max Concurrent Collections
                        </label>
                        <Input defaultValue="5" type="number" className="font-mono" />
                      </div>
                      <div className="space-y-2">
                        <label className="font-mono text-xs text-muted-foreground uppercase">
                          Retry Attempts
                        </label>
                        <Input defaultValue="3" type="number" className="font-mono" />
                      </div>
                      <Button variant="tactical" className="w-full">
                        <Save className="w-4 h-4" />
                        SAVE CHANGES
                      </Button>
                    </div>
                  </TacticalPanel>

                  <TacticalPanel title="SESSION SETTINGS">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="font-mono text-xs text-muted-foreground uppercase">
                          Session Timeout (minutes)
                        </label>
                        <Input defaultValue="15" type="number" className="font-mono" />
                      </div>
                      <div className="space-y-2">
                        <label className="font-mono text-xs text-muted-foreground uppercase">
                          Max Failed Login Attempts
                        </label>
                        <Input defaultValue="5" type="number" className="font-mono" />
                      </div>
                      <div className="space-y-2">
                        <label className="font-mono text-xs text-muted-foreground uppercase">
                          Lockout Duration (minutes)
                        </label>
                        <Input defaultValue="30" type="number" className="font-mono" />
                      </div>
                      <Button variant="tactical" className="w-full">
                        <Save className="w-4 h-4" />
                        SAVE CHANGES
                      </Button>
                    </div>
                  </TacticalPanel>

                  <TacticalPanel title="AUDIT SETTINGS">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="font-mono text-xs text-muted-foreground uppercase">
                          Log Retention (days)
                        </label>
                        <Input defaultValue="365" type="number" className="font-mono" />
                      </div>
                      <div className="space-y-2">
                        <label className="font-mono text-xs text-muted-foreground uppercase">
                          Syslog Server
                        </label>
                        <Input
                          defaultValue="syslog.internal:514"
                          className="font-mono"
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 border border-border bg-secondary">
                        <span className="font-mono text-xs text-muted-foreground uppercase">
                          Enable Remote Logging
                        </span>
                        <div className="w-12 h-6 bg-primary/20 border border-primary relative cursor-pointer">
                          <div className="absolute right-0.5 top-0.5 w-5 h-5 bg-primary" />
                        </div>
                      </div>
                      <Button variant="tactical" className="w-full">
                        <Save className="w-4 h-4" />
                        SAVE CHANGES
                      </Button>
                    </div>
                  </TacticalPanel>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-secondary px-6 py-2 flex items-center justify-between font-mono text-xs text-muted-foreground">
        <span>ADMIN: ADMIN</span>
        <span>CONFIG VERSION: 2.1.0-r45</span>
        <span>{new Date().toISOString()}</span>
      </footer>
    </div>
  );
}

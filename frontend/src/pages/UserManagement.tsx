import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { StatusIndicator } from "@/components/StatusIndicator";
import { Button } from "@/components/ui/button";
import {
  Users,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  Shield,
  UserCheck,
  UserX,
  Key,
  Eye,
  EyeOff,
} from "lucide-react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { cn } from "@/lib/utils";

interface UserOut {
  id: string;
  username: string;
  role: "admin" | "operator" | "viewer";
  status: string;
  last_login: string;
  created_at: string;
}

// Password strength: 0=none, 1=weak, 2=medium, 3=strong
function getPasswordStrength(pw: string): 0 | 1 | 2 | 3 {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[0-9]/.test(pw)) score++;
  return Math.min(3, score) as 0 | 1 | 2 | 3;
}

const ROLE_CHIP: Record<string, string> = {
  admin: "border-red-500/40 bg-red-500/10 text-red-400",
  operator: "border-primary/40 bg-primary/10 text-primary",
  viewer: "border-blue-500/40 bg-blue-500/10 text-blue-400",
};

export default function UserManagement() {
  const queryClient = useQueryClient();
  const selfUsername: string = (() => {
    try {
      return (
        (JSON.parse(localStorage.getItem("dfir_auth") ?? "{}") as { username?: string })
          .username ?? ""
      );
    } catch {
      return "";
    }
  })();

  // List query
  const {
    data: users = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<UserOut[]>({
    queryKey: ["admin-users"],
    queryFn: () => apiGet<UserOut[]>("/users/"),
    refetchInterval: 30000,
  });

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [newRole, setNewRole] = useState<"admin" | "operator" | "viewer">("operator");
  const [newStatus, setNewStatus] = useState<"active" | "inactive">("active");
  const [creating, setCreating] = useState(false);

  // Delete confirm state
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Password reset state
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [showResetPw, setShowResetPw] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Error state
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const pwStrength = getPasswordStrength(newPassword);
  const pwStrengthLabel = ["", "WEAK", "MEDIUM", "STRONG"][pwStrength];
  const pwStrengthColor = ["", "bg-destructive", "bg-yellow-500", "bg-green-500"][pwStrength];

  const handleCreate = async () => {
    if (!newUsername.trim() || !newPassword) {
      setErrorMsg("Username and password required.");
      return;
    }
    setCreating(true);
    setErrorMsg(null);
    try {
      await apiPost("/users/", {
        username: newUsername.trim(),
        password: newPassword,
        role: newRole,
        status: newStatus,
      });
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setNewUsername("");
      setNewPassword("");
      setNewRole("operator");
      setNewStatus("active");
      setShowCreate(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to create user.");
    } finally {
      setCreating(false);
    }
  };

  const handleRoleChange = async (userId: string, role: "admin" | "operator" | "viewer") => {
    setErrorMsg(null);
    try {
      await apiPatch(`/users/${userId}`, { role });
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update role.");
    }
  };

  const handleToggleStatus = async (user: UserOut) => {
    const next = user.status === "active" ? "inactive" : "active";
    setErrorMsg(null);
    try {
      await apiPatch(`/users/${user.id}`, { status: next });
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update status.");
    }
  };

  const handlePasswordReset = async (userId: string) => {
    if (!resetPw.trim()) {
      setErrorMsg("New password cannot be empty.");
      return;
    }
    setResetting(true);
    setErrorMsg(null);
    try {
      await apiPatch(`/users/${userId}`, { password: resetPw });
      setResetTarget(null);
      setResetPw("");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to reset password.");
    } finally {
      setResetting(false);
    }
  };

  const handleDelete = async (userId: string) => {
    if (confirmDelete !== userId) {
      setConfirmDelete(userId);
      return;
    }
    setConfirmDelete(null);
    setErrorMsg(null);
    try {
      await apiDelete(`/users/${userId}`);
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to delete user.");
    }
  };

  const adminCount = users.filter((u) => u.role === "admin").length;
  const activeCount = users.filter((u) => u.status === "active").length;

  return (
    <AppLayout
      title="USER MANAGEMENT"
      subtitle="OPERATOR ACCOUNTS & ACCESS CONTROL"
      headerActions={
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refetch()}
            disabled={isRefetching}
          >
            <RefreshCw className={cn("w-4 h-4 mr-2", isRefetching && "animate-spin")} />
            REFRESH
          </Button>
          <Button variant="tactical" size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-2" />
            ADD USER
          </Button>
        </div>
      }
    >
      <div className="p-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="border border-border bg-card p-4 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground font-mono text-xs">
              <Users className="w-4 h-4" />
              TOTAL USERS
            </div>
            <div className="font-mono text-2xl font-bold text-foreground">{users.length}</div>
          </div>
          <div className="border border-green-500/30 bg-green-500/5 p-4 space-y-1">
            <div className="flex items-center gap-2 text-green-400 font-mono text-xs">
              <UserCheck className="w-4 h-4" />
              ACTIVE
            </div>
            <div className="font-mono text-2xl font-bold text-green-400">{activeCount}</div>
          </div>
          <div className="border border-red-500/30 bg-red-500/5 p-4 space-y-1">
            <div className="flex items-center gap-2 text-red-400 font-mono text-xs">
              <Shield className="w-4 h-4" />
              ADMINS
            </div>
            <div className="font-mono text-2xl font-bold text-red-400">{adminCount}</div>
          </div>
        </div>

        {/* Error */}
        {errorMsg && (
          <div className="border border-destructive/40 bg-destructive/10 p-3 font-mono text-xs text-destructive">
            {errorMsg}
          </div>
        )}

        {/* Create form */}
        {showCreate && (
          <TacticalPanel title="CREATE USER">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-mono text-xs text-muted-foreground uppercase">
                    Username
                  </label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="e.g. analyst01"
                    className="w-full px-3 py-2 bg-secondary border border-border font-mono text-sm text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-mono text-xs text-muted-foreground uppercase">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Min 8 characters"
                      className="w-full px-3 py-2 pr-10 bg-secondary border border-border font-mono text-sm text-foreground focus:outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {newPassword && (
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            pwStrengthColor
                          )}
                          style={{ width: `${(pwStrength / 3) * 100}%` }}
                        />
                      </div>
                      <span
                        className={cn(
                          "font-mono text-[10px]",
                          pwStrength === 3
                            ? "text-green-400"
                            : pwStrength === 2
                              ? "text-yellow-400"
                              : "text-destructive"
                        )}
                      >
                        {pwStrengthLabel}
                      </span>
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="font-mono text-xs text-muted-foreground uppercase">
                    Role
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) =>
                      setNewRole(e.target.value as typeof newRole)
                    }
                    className="w-full px-3 py-2 bg-secondary border border-border font-mono text-sm text-foreground focus:outline-none focus:border-primary"
                  >
                    <option value="viewer">viewer</option>
                    <option value="operator">operator</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-mono text-xs text-muted-foreground uppercase">
                    Status
                  </label>
                  <select
                    value={newStatus}
                    onChange={(e) =>
                      setNewStatus(e.target.value as typeof newStatus)
                    }
                    className="w-full px-3 py-2 bg-secondary border border-border font-mono text-sm text-foreground focus:outline-none focus:border-primary"
                  >
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => void handleCreate()} disabled={creating}>
                  {creating ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Key className="w-4 h-4 mr-2" />
                  )}
                  CREATE
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowCreate(false);
                    setErrorMsg(null);
                  }}
                >
                  CANCEL
                </Button>
              </div>
            </div>
          </TacticalPanel>
        )}

        {/* User list */}
        <TacticalPanel
          title="REGISTERED OPERATORS"
          headerActions={
            <span className="font-mono text-xs text-primary">
              {activeCount}/{users.length} ACTIVE
            </span>
          }
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-border bg-secondary/30">
                <div className="col-span-3 font-mono text-xs text-muted-foreground uppercase">
                  USERNAME
                </div>
                <div className="col-span-2 font-mono text-xs text-muted-foreground uppercase">
                  ROLE
                </div>
                <div className="col-span-2 font-mono text-xs text-muted-foreground uppercase">
                  STATUS
                </div>
                <div className="col-span-2 font-mono text-xs text-muted-foreground uppercase">
                  LAST LOGIN
                </div>
                <div className="col-span-3 font-mono text-xs text-muted-foreground uppercase">
                  ACTIONS
                </div>
              </div>
              {users.map((u) => {
                const isSelf = u.username === selfUsername;
                const isResetting = resetTarget === u.id;
                const resetStrength = getPasswordStrength(resetPw);
                return (
                  <div key={u.id}>
                  <div
                    className={cn(
                      "grid grid-cols-12 gap-2 px-4 py-3 border-b border-border/50 hover:bg-secondary/20 transition-colors items-center",
                      isSelf && "bg-primary/[0.03]",
                      isResetting && "border-primary/20 bg-primary/[0.03]"
                    )}
                  >
                    <div className="col-span-3 flex items-center gap-2">
                      <span className="font-mono text-sm font-bold truncate">
                        {u.username}
                      </span>
                      {isSelf && (
                        <span className="font-mono text-[10px] text-primary border border-primary/30 px-1">
                          YOU
                        </span>
                      )}
                    </div>
                    <div className="col-span-2">
                      <select
                        value={u.role}
                        disabled={isSelf}
                        onChange={(e) =>
                          void handleRoleChange(
                            u.id,
                            e.target.value as UserOut["role"]
                          )
                        }
                        className={cn(
                          "px-2 py-0.5 rounded-sm border font-mono text-xs bg-transparent focus:outline-none",
                          ROLE_CHIP[u.role],
                          isSelf && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <option value="viewer">viewer</option>
                        <option value="operator">operator</option>
                        <option value="admin">admin</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <StatusIndicator
                        status={u.status === "active" ? "online" : "offline"}
                        label={u.status.toUpperCase()}
                        size="sm"
                      />
                    </div>
                    <div className="col-span-2 font-mono text-xs text-muted-foreground">
                      {u.last_login ? new Date(u.last_login).toLocaleDateString() : "—"}
                    </div>
                    <div className="col-span-3 flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isSelf}
                        title={u.status === "active" ? "Deactivate" : "Activate"}
                        onClick={() => void handleToggleStatus(u)}
                        className={cn(isSelf && "opacity-30")}
                      >
                        {u.status === "active" ? (
                          <UserX className="w-3.5 h-3.5 text-muted-foreground hover:text-yellow-400" />
                        ) : (
                          <UserCheck className="w-3.5 h-3.5 text-muted-foreground hover:text-green-400" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isSelf}
                        title="Reset password"
                        onClick={() => {
                          setResetTarget(isResetting ? null : u.id);
                          setResetPw("");
                          setConfirmDelete(null);
                        }}
                        className={cn(
                          "transition-colors",
                          isResetting ? "text-primary bg-primary/10" : "",
                          isSelf && "opacity-30"
                        )}
                      >
                        <Key className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isSelf}
                        onClick={() => void handleDelete(u.id)}
                        title={
                          confirmDelete === u.id
                            ? "Click again to confirm"
                            : "Delete user"
                        }
                        className={cn(
                          "transition-colors",
                          confirmDelete === u.id
                            ? "text-destructive bg-destructive/10"
                            : "",
                          isSelf && "opacity-30"
                        )}
                      >
                        {confirmDelete === u.id ? (
                          <span className="font-mono text-[10px]">CONFIRM?</span>
                        ) : (
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                      </Button>
                      {confirmDelete === u.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDelete(null)}
                          className="font-mono text-[10px] text-muted-foreground"
                        >
                          CANCEL
                        </Button>
                      )}
                    </div>
                  </div>
                  {/* Inline password reset form */}
                  {isResetting && (
                    <div className="px-4 py-3 border-b border-primary/20 bg-primary/[0.04] flex items-center gap-3">
                      <Key className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="font-mono text-xs text-muted-foreground w-24 shrink-0">
                        NEW PASSWORD
                      </span>
                      <div className="relative flex-1 max-w-xs">
                        <input
                          type={showResetPw ? "text" : "password"}
                          value={resetPw}
                          onChange={(e) => setResetPw(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") void handlePasswordReset(u.id); }}
                          placeholder="New password…"
                          className="w-full px-3 py-1.5 pr-8 bg-secondary border border-border font-mono text-sm text-foreground focus:outline-none focus:border-primary"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setShowResetPw((v) => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showResetPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      {resetPw && (
                        <div className="flex items-center gap-1.5">
                          <div className="w-16 h-1 bg-secondary rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                ["", "bg-destructive", "bg-yellow-500", "bg-green-500"][resetStrength]
                              )}
                              style={{ width: `${(resetStrength / 3) * 100}%` }}
                            />
                          </div>
                        </div>
                      )}
                      <Button
                        size="sm"
                        onClick={() => void handlePasswordReset(u.id)}
                        disabled={resetting || !resetPw.trim()}
                      >
                        {resetting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          "SAVE"
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setResetTarget(null); setResetPw(""); }}
                        className="font-mono text-xs text-muted-foreground"
                      >
                        CANCEL
                      </Button>
                    </div>
                  )}
                  </div>
                );
              })}
            </div>
          )}
        </TacticalPanel>
      </div>
    </AppLayout>
  );
}

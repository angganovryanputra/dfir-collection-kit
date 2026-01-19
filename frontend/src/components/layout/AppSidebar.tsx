import { useNavigate, useLocation } from "react-router-dom";
import {
  Shield,
  LayoutDashboard,
  Plus,
  FolderLock,
  FileText,
  Monitor,
  FileStack,
  Settings,
  LogOut,
  Activity,
  Server,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
  badge?: string;
}

const mainNavItems: NavItem[] = [
  { label: "DASHBOARD", icon: LayoutDashboard, path: "/dashboard" },
  { label: "CREATE INCIDENT", icon: Plus, path: "/incidents/create" },
  { label: "EVIDENCE VAULT", icon: FolderLock, path: "/evidence" },
  { label: "CHAIN OF CUSTODY", icon: FileText, path: "/chain-of-custody" },
];

const systemNavItems: NavItem[] = [
  { label: "DEVICES", icon: Monitor, path: "/devices" },
  { label: "TEMPLATES", icon: FileStack, path: "/incident-templates" },
  { label: "ADMIN SETTINGS", icon: Settings, path: "/admin/settings" },
];

interface AppSidebarProps {
  activeIncidents?: number;
  onlineCollectors?: number;
  totalCollectors?: number;
  isCollapsed: boolean;
  onCollapsedChange: (next: boolean) => void;
}

export function AppSidebar({
  activeIncidents = 0,
  onlineCollectors = 0,
  totalCollectors = 0,
  isCollapsed,
  onCollapsedChange,
}: AppSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    localStorage.removeItem("dfir_auth");
    localStorage.removeItem("dfir_logout_reason");
    localStorage.setItem(
      "dfir_logout_reason",
      JSON.stringify({
        reason: "manual",
        timestamp: new Date().toISOString(),
      })
    );
    navigate("/login", { replace: true, state: { logoutReason: "manual" } });
  };

  const NavButton = ({ item }: { item: NavItem }) => {
    const isActive =
      location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
    const Icon = item.icon;

    return (
      <button
        onClick={() => navigate(item.path)}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 font-mono text-xs uppercase tracking-wider transition-all",
          isActive
            ? "bg-primary/10 text-primary border-l-2 border-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary border-l-2 border-transparent"
        )}
      >
        <Icon className="w-4 h-4 flex-shrink-0" />
        {!isCollapsed && (
          <>
            <span className="flex-1 text-left">{item.label}</span>
            {item.badge && (
              <span className="px-1.5 py-0.5 bg-primary/20 text-primary text-[10px]">
                {item.badge}
              </span>
            )}
          </>
        )}
      </button>
    );
  };

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex flex-col bg-card border-r border-border transition-all duration-300",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="relative flex-shrink-0">
            <Shield className="w-8 h-8 text-primary" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-primary rounded-full animate-pulse" />
          </div>
          {!isCollapsed && (
            <div className="overflow-hidden">
              <h1 className="font-mono text-sm font-bold tracking-wider text-foreground truncate">
                DFIR KIT
              </h1>
              <p className="font-mono text-[10px] text-muted-foreground">
                v2.1.0
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      {!isCollapsed && (
        <div className="p-4 border-b border-border space-y-2">
          <div className="flex items-center justify-between font-mono text-xs">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Activity className="w-3 h-3" />
              <span>ACTIVE</span>
            </div>
            <span className="text-primary font-bold">{activeIncidents}</span>
          </div>
          <div className="flex items-center justify-between font-mono text-xs">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Server className="w-3 h-3" />
              <span>COLLECTORS</span>
            </div>
            <span className="text-primary font-bold">
              {onlineCollectors}/{totalCollectors}
            </span>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {/* Main Section */}
        {!isCollapsed && (
          <div className="px-3 mb-2">
            <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
              Operations
            </span>
          </div>
        )}
        <div className="space-y-1">
          {mainNavItems.map((item) => (
            <NavButton key={item.path} item={item} />
          ))}
        </div>

        {/* System Section */}
        <div className="mt-6">
          {!isCollapsed && (
            <div className="px-3 mb-2">
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                System
              </span>
            </div>
          )}
          <div className="space-y-1">
            {systemNavItems.map((item) => (
              <NavButton key={item.path} item={item} />
            ))}
          </div>
        </div>
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-border space-y-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onCollapsedChange(!isCollapsed)}
          className="w-full justify-center"
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4 mr-2" />
              <span className="font-mono text-xs">COLLAPSE</span>
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className={cn(
            "w-full text-destructive hover:text-destructive hover:bg-destructive/10",
            isCollapsed ? "justify-center" : ""
          )}
        >
          <LogOut className="w-4 h-4" />
          {!isCollapsed && <span className="font-mono text-xs ml-2">LOGOUT</span>}
        </Button>
      </div>
    </aside>
  );
}

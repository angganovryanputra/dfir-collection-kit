import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TacticalPanel } from "@/components/TacticalPanel";
import { StatusIndicator } from "@/components/StatusIndicator";
import { TablePagination } from "@/components/TablePagination";
import { usePagination } from "@/hooks/usePagination";
import {
  Search,
  RefreshCw,
  Plus,
  Monitor,
  Server,
  HardDrive,
  Laptop,
  Wifi,
  WifiOff,
  Clock,
  Activity,
  Settings,
  Power,
  Trash2,
} from "lucide-react";

interface Device {
  id: string;
  hostname: string;
  ipAddress: string;
  type: "workstation" | "server" | "laptop" | "virtual";
  os: string;
  agentVersion: string;
  status: "online" | "offline" | "degraded" | "pending";
  lastSeen: string;
  cpuUsage?: number;
  memoryUsage?: number;
  collectionStatus: "idle" | "collecting" | "queued";
  registeredAt: string;
}

const mockDevices: Device[] = [
  {
    id: "DEV-001",
    hostname: "WS-FINANCE-01",
    ipAddress: "192.168.1.101",
    type: "workstation",
    os: "Windows 11 Pro",
    agentVersion: "2.1.0",
    status: "online",
    lastSeen: "2026-01-14T17:15:00Z",
    cpuUsage: 23,
    memoryUsage: 67,
    collectionStatus: "idle",
    registeredAt: "2025-06-15T08:00:00Z",
  },
  {
    id: "DEV-002",
    hostname: "WS-FINANCE-02",
    ipAddress: "192.168.1.102",
    type: "workstation",
    os: "Windows 11 Pro",
    agentVersion: "2.1.0",
    status: "online",
    lastSeen: "2026-01-14T17:14:30Z",
    cpuUsage: 45,
    memoryUsage: 72,
    collectionStatus: "collecting",
    registeredAt: "2025-06-15T08:30:00Z",
  },
  {
    id: "DEV-003",
    hostname: "SRV-DB-01",
    ipAddress: "192.168.1.10",
    type: "server",
    os: "Windows Server 2022",
    agentVersion: "2.1.0",
    status: "online",
    lastSeen: "2026-01-14T17:15:00Z",
    cpuUsage: 12,
    memoryUsage: 45,
    collectionStatus: "idle",
    registeredAt: "2025-05-01T10:00:00Z",
  },
  {
    id: "DEV-004",
    hostname: "DC-PRIMARY",
    ipAddress: "192.168.1.5",
    type: "server",
    os: "Windows Server 2022",
    agentVersion: "2.1.0",
    status: "online",
    lastSeen: "2026-01-14T17:15:00Z",
    cpuUsage: 8,
    memoryUsage: 38,
    collectionStatus: "idle",
    registeredAt: "2025-04-10T09:00:00Z",
  },
  {
    id: "DEV-005",
    hostname: "LT-EXEC-01",
    ipAddress: "192.168.1.150",
    type: "laptop",
    os: "Windows 11 Pro",
    agentVersion: "2.0.5",
    status: "offline",
    lastSeen: "2026-01-14T09:30:00Z",
    collectionStatus: "idle",
    registeredAt: "2025-07-20T14:00:00Z",
  },
  {
    id: "DEV-006",
    hostname: "VM-TEST-01",
    ipAddress: "192.168.1.200",
    type: "virtual",
    os: "Ubuntu 22.04 LTS",
    agentVersion: "2.1.0",
    status: "degraded",
    lastSeen: "2026-01-14T17:10:00Z",
    cpuUsage: 89,
    memoryUsage: 92,
    collectionStatus: "queued",
    registeredAt: "2025-09-01T11:00:00Z",
  },
  {
    id: "DEV-007",
    hostname: "WS-HR-01",
    ipAddress: "192.168.1.120",
    type: "workstation",
    os: "Windows 10 Pro",
    agentVersion: "2.0.5",
    status: "online",
    lastSeen: "2026-01-14T17:14:00Z",
    cpuUsage: 34,
    memoryUsage: 55,
    collectionStatus: "idle",
    registeredAt: "2025-08-15T08:00:00Z",
  },
  {
    id: "DEV-008",
    hostname: "SRV-FILE-01",
    ipAddress: "192.168.1.15",
    type: "server",
    os: "Windows Server 2019",
    agentVersion: "2.1.0",
    status: "online",
    lastSeen: "2026-01-14T17:15:00Z",
    cpuUsage: 15,
    memoryUsage: 62,
    collectionStatus: "idle",
    registeredAt: "2025-03-01T10:00:00Z",
  },
  {
    id: "DEV-009",
    hostname: "LT-SALES-01",
    ipAddress: "192.168.1.155",
    type: "laptop",
    os: "Windows 11 Pro",
    agentVersion: "2.1.0",
    status: "pending",
    lastSeen: "-",
    collectionStatus: "idle",
    registeredAt: "2026-01-14T16:00:00Z",
  },
  {
    id: "DEV-010",
    hostname: "WS-DEV-01",
    ipAddress: "192.168.1.130",
    type: "workstation",
    os: "Windows 11 Pro",
    agentVersion: "2.1.0",
    status: "online",
    lastSeen: "2026-01-14T17:14:45Z",
    cpuUsage: 67,
    memoryUsage: 78,
    collectionStatus: "idle",
    registeredAt: "2025-10-01T09:00:00Z",
  },
  {
    id: "DEV-011",
    hostname: "SRV-BACKUP-01",
    ipAddress: "192.168.1.20",
    type: "server",
    os: "Windows Server 2022",
    agentVersion: "2.1.0",
    status: "online",
    lastSeen: "2026-01-14T17:15:00Z",
    cpuUsage: 5,
    memoryUsage: 30,
    collectionStatus: "idle",
    registeredAt: "2025-02-15T08:00:00Z",
  },
  {
    id: "DEV-012",
    hostname: "WS-LEGAL-01",
    ipAddress: "192.168.1.125",
    type: "workstation",
    os: "Windows 11 Pro",
    agentVersion: "2.0.5",
    status: "offline",
    lastSeen: "2026-01-13T18:00:00Z",
    collectionStatus: "idle",
    registeredAt: "2025-07-01T10:00:00Z",
  },
];

type FilterStatus = "all" | "online" | "offline" | "degraded" | "pending";
type FilterType = "all" | "workstation" | "server" | "laptop" | "virtual";

export default function Devices() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [devices] = useState<Device[]>(mockDevices);

  const filteredDevices = devices.filter((device) => {
    const matchesSearch =
      device.hostname.toLowerCase().includes(searchQuery.toLowerCase()) ||
      device.ipAddress.includes(searchQuery) ||
      device.os.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" || device.status === filterStatus;
    const matchesType = filterType === "all" || device.type === filterType;
    return matchesSearch && matchesStatus && matchesType;
  });

  const {
    paginatedItems,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    goToPage,
    setPerPage,
  } = usePagination(filteredDevices);

  const onlineCount = devices.filter((d) => d.status === "online").length;
  const offlineCount = devices.filter((d) => d.status === "offline").length;
  const degradedCount = devices.filter((d) => d.status === "degraded").length;

  const getDeviceIcon = (type: Device["type"]) => {
    switch (type) {
      case "server":
        return <Server className="w-4 h-4" />;
      case "laptop":
        return <Laptop className="w-4 h-4" />;
      case "virtual":
        return <HardDrive className="w-4 h-4" />;
      default:
        return <Monitor className="w-4 h-4" />;
    }
  };

  const getStatusIndicator = (status: Device["status"]) => {
    switch (status) {
      case "online":
        return <StatusIndicator status="online" label="ONLINE" size="sm" />;
      case "offline":
        return <StatusIndicator status="offline" label="OFFLINE" size="sm" />;
      case "degraded":
        return <StatusIndicator status="pending" label="DEGRADED" size="sm" />;
      case "pending":
        return <StatusIndicator status="pending" label="PENDING" size="sm" />;
    }
  };

  const getCollectionStatus = (status: Device["collectionStatus"]) => {
    switch (status) {
      case "collecting":
        return (
          <span className="px-2 py-0.5 font-mono text-xs border border-primary/30 bg-primary/10 text-primary">
            COLLECTING
          </span>
        );
      case "queued":
        return (
          <span className="px-2 py-0.5 font-mono text-xs border border-warning/30 bg-warning/10 text-warning">
            QUEUED
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 font-mono text-xs border border-border bg-secondary text-muted-foreground">
            IDLE
          </span>
        );
    }
  };

  const formatLastSeen = (lastSeen: string) => {
    if (lastSeen === "-") return "NEVER";
    const date = new Date(lastSeen);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "JUST NOW";
    if (diffMins < 60) return `${diffMins}m AGO`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h AGO`;
    return `${Math.floor(diffMins / 1440)}d AGO`;
  };

  return (
    <AppLayout
      title="DEVICE MANAGEMENT"
      subtitle="AGENT INTEGRATION & ENDPOINT STATUS"
      headerActions={
        <div className="flex items-center gap-6 font-mono text-xs">
          <div className="flex items-center gap-2">
            <Wifi className="w-4 h-4 text-primary" />
            <span className="text-muted-foreground">ONLINE:</span>
            <span className="text-primary font-bold">{onlineCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-destructive" />
            <span className="text-muted-foreground">OFFLINE:</span>
            <span className="text-destructive font-bold">{offlineCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-warning" />
            <span className="text-muted-foreground">DEGRADED:</span>
            <span className="text-warning font-bold">{degradedCount}</span>
          </div>
        </div>
      }
    >
      <div className="p-6 h-full flex flex-col">
        {/* Filters & Actions */}
        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <div className="relative flex-1 min-w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search hostname, IP, or OS..."
              className="pl-10"
            />
          </div>
          
          {/* Status Filter */}
          <div className="flex items-center gap-2">
            {(["all", "online", "offline", "degraded"] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3 py-1.5 border font-mono text-xs uppercase tracking-wider transition-all ${
                  filterStatus === status
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-secondary text-muted-foreground hover:border-muted-foreground"
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-2">
            {(["all", "workstation", "server", "laptop", "virtual"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 py-1.5 border font-mono text-xs uppercase tracking-wider transition-all ${
                  filterType === type
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-secondary text-muted-foreground hover:border-muted-foreground"
                }`}
              >
                {type === "all" ? "ALL" : type.slice(0, 3).toUpperCase()}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <Button variant="secondary">
              <RefreshCw className="w-4 h-4 mr-2" />
              REFRESH
            </Button>
            <Button variant="tactical">
              <Plus className="w-4 h-4 mr-2" />
              ADD DEVICE
            </Button>
          </div>
        </div>

        {/* Devices Table */}
        <TacticalPanel
          title="REGISTERED DEVICES"
          status="online"
          className="flex-1 overflow-hidden flex flex-col"
          headerActions={
            <span className="font-mono text-xs text-muted-foreground">
              {filteredDevices.length} DEVICES
            </span>
          }
        >
          <div className="flex-1 overflow-auto">
            {/* Header */}
            <div className="grid grid-cols-12 gap-4 px-4 py-3 font-mono text-xs text-muted-foreground uppercase tracking-wider border-b border-border sticky top-0 bg-card z-10">
              <div className="col-span-2">Hostname</div>
              <div className="col-span-1">Type</div>
              <div className="col-span-2">IP Address</div>
              <div className="col-span-2">OS</div>
              <div className="col-span-1">Agent</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-1">Last Seen</div>
              <div className="col-span-1">Collection</div>
              <div className="col-span-1">Actions</div>
            </div>

            {/* Rows */}
            {paginatedItems.map((device) => (
              <div
                key={device.id}
                className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-border/50 hover:bg-secondary/30 transition-colors items-center"
              >
                <div className="col-span-2 flex items-center gap-2">
                  <div className={`${device.status === "online" ? "text-primary" : "text-muted-foreground"}`}>
                    {getDeviceIcon(device.type)}
                  </div>
                  <span className="font-mono text-sm font-bold truncate">
                    {device.hostname}
                  </span>
                </div>
                <div className="col-span-1">
                  <span className="font-mono text-xs text-muted-foreground uppercase">
                    {device.type}
                  </span>
                </div>
                <div className="col-span-2 font-mono text-sm text-muted-foreground">
                  {device.ipAddress}
                </div>
                <div className="col-span-2 font-mono text-xs text-muted-foreground truncate">
                  {device.os}
                </div>
                <div className="col-span-1">
                  <span className={`font-mono text-xs ${
                    device.agentVersion === "2.1.0" ? "text-primary" : "text-warning"
                  }`}>
                    v{device.agentVersion}
                  </span>
                </div>
                <div className="col-span-1">
                  {getStatusIndicator(device.status)}
                </div>
                <div className="col-span-1 font-mono text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatLastSeen(device.lastSeen)}
                  </div>
                </div>
                <div className="col-span-1">
                  {getCollectionStatus(device.collectionStatus)}
                </div>
                <div className="col-span-1 flex items-center gap-1">
                  <Button variant="ghost" size="sm" title="Configure">
                    <Settings className="w-3 h-3" />
                  </Button>
                  <Button variant="ghost" size="sm" title="Toggle Status">
                    <Power className={`w-3 h-3 ${device.status === "online" ? "text-primary" : "text-muted-foreground"}`} />
                  </Button>
                  <Button variant="ghost" size="sm" title="Remove">
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}

            {paginatedItems.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Monitor className="w-12 h-12 mb-4 opacity-50" />
                <span className="font-mono text-sm">NO DEVICES FOUND</span>
              </div>
            )}
          </div>

          {/* Pagination */}
          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={goToPage}
            onItemsPerPageChange={setPerPage}
          />
        </TacticalPanel>
      </div>
    </AppLayout>
  );
}

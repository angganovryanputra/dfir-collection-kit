import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { TacticalPanel } from "@/components/TacticalPanel";
import { StatusIndicator } from "@/components/StatusIndicator";
import { TablePagination } from "@/components/TablePagination";
import { SearchInput } from "@/components/common/SearchInput";
import { SelectableButton } from "@/components/common/SelectableButton";
import { TableHeaderRow } from "@/components/common/TableHeaderRow";
import { usePagination } from "@/hooks/usePagination";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormLabel } from "@/components/common/FormLabel";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
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
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";

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

interface DeviceResponse {
  id: string;
  hostname: string;
  ip_address: string;
  type: "workstation" | "server" | "laptop" | "virtual";
  os: string;
  agent_version: string;
  status: "online" | "offline" | "degraded" | "pending";
  last_seen: string;
  cpu_usage?: number;
  memory_usage?: number;
  collection_status: "idle" | "collecting" | "queued";
  registered_at: string;
}

const mapDevice = (device: DeviceResponse): Device => ({
  id: device.id,
  hostname: device.hostname,
  ipAddress: device.ip_address,
  type: device.type,
  os: device.os,
  agentVersion: device.agent_version,
  status: device.status,
  lastSeen: device.last_seen,
  cpuUsage: device.cpu_usage ?? undefined,
  memoryUsage: device.memory_usage ?? undefined,
  collectionStatus: device.collection_status,
  registeredAt: device.registered_at,
});


type FilterStatus = "all" | "online" | "offline" | "degraded" | "pending";
type FilterType = "all" | "workstation" | "server" | "laptop" | "virtual";

export default function Devices() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [devices, setDevices] = useState<Device[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSavingDevice, setIsSavingDevice] = useState(false);
  const [newDevice, setNewDevice] = useState({
    hostname: "",
    ipAddress: "",
    type: "workstation" as Device["type"],
    os: "",
    agentVersion: "2.1.0",
    status: "online" as Device["status"],
    collectionStatus: "idle" as Device["collectionStatus"],
  });

  const devicesQuery = useQuery({
    queryKey: ["devices"],
    queryFn: () => apiGet<DeviceResponse[]>("/devices"),
    onError: () => setErrorMessage("Unable to load devices."),
  });

  useEffect(() => {
    if (devicesQuery.data) {
      setDevices(devicesQuery.data.map(mapDevice));
      setErrorMessage(null);
    }
  }, [devicesQuery.data]);

  const handleAddDevice = async () => {
    if (!newDevice.hostname.trim() || !newDevice.ipAddress.trim()) {
      setErrorMessage("Hostname and IP address are required.");
      return;
    }
    setIsSavingDevice(true);
    setErrorMessage(null);
    try {
      const now = new Date().toISOString();
      const response = await apiPost<DeviceResponse>("/devices", {
        id: crypto.randomUUID(),
        hostname: newDevice.hostname.trim().toUpperCase(),
        ip_address: newDevice.ipAddress.trim(),
        type: newDevice.type,
        os: newDevice.os.trim() || "unknown",
        agent_version: newDevice.agentVersion.trim() || "unknown",
        status: newDevice.status,
        last_seen: now,
        cpu_usage: null,
        memory_usage: null,
        collection_status: newDevice.collectionStatus,
        registered_at: now,
      });
      setDevices((current) => [...current, mapDevice(response)]);
      setIsAddDialogOpen(false);
      setNewDevice({
        hostname: "",
        ipAddress: "",
        type: "workstation",
        os: "",
        agentVersion: "2.1.0",
        status: "online",
        collectionStatus: "idle",
      });
    } catch {
      setErrorMessage("Unable to add device.");
    } finally {
      setIsSavingDevice(false);
    }
  };


  const refreshDevices = () => {
    setErrorMessage(null);
    devicesQuery.refetch();
  };

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

  const toggleDeviceStatus = async (device: Device) => {
    const nextStatus = device.status === "online" ? "offline" : "online";
    try {
      const response = await apiPatch<DeviceResponse>(`/devices/${device.id}`, {
        status: nextStatus,
        last_seen: new Date().toISOString(),
      });
      const mapped = mapDevice(response);
      setDevices((current) => current.map((item) => (item.id === mapped.id ? mapped : item)));
    } catch {
      setErrorMessage("Unable to update device status.");
    }
  };

  const removeDevice = async (deviceId: string) => {
    try {
      await apiDelete(`/devices/${deviceId}`);
      setDevices((current) => current.filter((device) => device.id !== deviceId));
    } catch {
      setErrorMessage("Unable to remove device.");
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
          {errorMessage && (
            <div className="mb-4 border border-destructive/40 bg-destructive/10 p-3 font-mono text-xs text-destructive">
              {errorMessage}
            </div>
          )}

          {/* Filters & Actions */}
            <div className="flex items-center gap-4 mb-6 flex-wrap">
              <SearchInput
                wrapperClassName="min-w-64"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search hostname, IP, or OS..."
              />
            
            {/* Status Filter */}
            <div className="flex items-center gap-2">
              {(["all", "online", "offline", "degraded"] as const).map((status) => (
                <SelectableButton
                  key={status}
                  isActive={filterStatus === status}
                  onClick={() => setFilterStatus(status)}
                  className="px-3 py-1.5"
                >
                  {status}
                </SelectableButton>
              ))}
            </div>

            {/* Type Filter */}
            <div className="flex items-center gap-2">
              {(["all", "workstation", "server", "laptop", "virtual"] as const).map((type) => (
                <SelectableButton
                  key={type}
                  isActive={filterType === type}
                  onClick={() => setFilterType(type)}
                  className="px-3 py-1.5"
                >
                  {type === "all" ? "ALL" : type.slice(0, 3).toUpperCase()}
                </SelectableButton>
              ))}
            </div>


          <div className="flex gap-2">
            <Button variant="secondary" onClick={refreshDevices} disabled={devicesQuery.isFetching}>
              <RefreshCw className={`w-4 h-4 mr-2 ${devicesQuery.isFetching ? "animate-spin" : ""}`} />
              {devicesQuery.isFetching ? "REFRESHING" : "REFRESH"}
            </Button>
            <Button variant="tactical" onClick={() => setIsAddDialogOpen(true)}>
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
            <TableHeaderRow className="grid grid-cols-12 gap-4 sticky top-0 bg-card z-10">
              <div className="col-span-2">Hostname</div>
              <div className="col-span-1">Type</div>
              <div className="col-span-2">IP Address</div>
              <div className="col-span-2">OS</div>
              <div className="col-span-1">Agent</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-1">Last Seen</div>
              <div className="col-span-1">Collection</div>
              <div className="col-span-1">Actions</div>
            </TableHeaderRow>

            {/* Rows */}
            {paginatedItems.length === 0 ? (
              <div className="px-4 py-6 text-center font-mono text-xs text-muted-foreground">
                No devices available.
              </div>
            ) : (
              paginatedItems.map((device) => (
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
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Toggle Status"
                      onClick={() => toggleDeviceStatus(device)}
                    >
                      <Power
                        className={`w-3 h-3 ${device.status === "online" ? "text-primary" : "text-muted-foreground"}`}
                      />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Remove"
                      onClick={() => removeDevice(device.id)}
                    >
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))
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

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-xl bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-mono text-lg tracking-wider">ADD DEVICE</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <FormLabel>Hostname</FormLabel>
              <Input
                value={newDevice.hostname}
                onChange={(event) =>
                  setNewDevice((current) => ({
                    ...current,
                    hostname: event.target.value.toUpperCase(),
                  }))
                }
                placeholder="WS-FINANCE-03"
              />
            </div>
            <div className="space-y-2">
              <FormLabel>IP Address</FormLabel>
              <Input
                value={newDevice.ipAddress}
                onChange={(event) =>
                  setNewDevice((current) => ({
                    ...current,
                    ipAddress: event.target.value,
                  }))
                }
                placeholder="192.168.1.120"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <FormLabel>Device Type</FormLabel>
                <Select
                  value={newDevice.type}
                  onValueChange={(value) =>
                    setNewDevice((current) => ({
                      ...current,
                      type: value as Device["type"],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="workstation">Workstation</SelectItem>
                    <SelectItem value="server">Server</SelectItem>
                    <SelectItem value="laptop">Laptop</SelectItem>
                    <SelectItem value="virtual">Virtual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <FormLabel>Agent Version</FormLabel>
                <Input
                  value={newDevice.agentVersion}
                  onChange={(event) =>
                    setNewDevice((current) => ({
                      ...current,
                      agentVersion: event.target.value,
                    }))
                  }
                  placeholder="2.1.0"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <FormLabel>Status</FormLabel>
                <Select
                  value={newDevice.status}
                  onValueChange={(value) =>
                    setNewDevice((current) => ({
                      ...current,
                      status: value as Device["status"],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="offline">Offline</SelectItem>
                    <SelectItem value="degraded">Degraded</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <FormLabel>Collection Status</FormLabel>
                <Select
                  value={newDevice.collectionStatus}
                  onValueChange={(value) =>
                    setNewDevice((current) => ({
                      ...current,
                      collectionStatus: value as Device["collectionStatus"],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select collection" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="idle">Idle</SelectItem>
                    <SelectItem value="collecting">Collecting</SelectItem>
                    <SelectItem value="queued">Queued</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <FormLabel>Operating System</FormLabel>
              <Input
                value={newDevice.os}
                onChange={(event) =>
                  setNewDevice((current) => ({
                    ...current,
                    os: event.target.value,
                  }))
                }
                placeholder="Windows 11 Pro"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-4 border-t border-border">
            <Button variant="outline" className="flex-1" onClick={() => setIsAddDialogOpen(false)}>
              CANCEL
            </Button>
            <Button
              variant="tactical"
              className="flex-1"
              onClick={handleAddDevice}
              disabled={isSavingDevice}
            >
              {isSavingDevice ? "ADDING" : "ADD DEVICE"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

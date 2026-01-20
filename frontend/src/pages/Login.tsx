import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { WarningBanner } from "@/components/WarningBanner";
import { FormLabel } from "@/components/common/FormLabel";
import { InputWithIcon } from "@/components/common/InputWithIcon";
import { SelectableButton } from "@/components/common/SelectableButton";
import { Shield, Lock, User, Terminal, Cpu, Radio, Radar, Server, AlertCircle, Database } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1").replace(/\/$/, "");

type DbStatus = "ok" | "degraded" | "error" | "unknown";

type SequenceContext = {
  username: string;
  role: string;
  tokenTTLMinutes: number | null;
  clientIp: string | null;
  connectionLabel: string;
  dbStatus: DbStatus;
  handshakeLatencyMs: number | null;
  serverTime: string | null;
  backendVersion: string | null;
  logoutReason?: string | null;
};

type CurrentUserResponse = {
  id: string;
  username: string;
  role: "operator" | "viewer" | "admin";
  status: string;
};

type SequenceStep = {
  getText: (context: SequenceContext) => string;
  minDelay: number;
  jitter?: number;
};

type DiagnosticsResponse = {
  db_status?: string;
  server_time?: string | null;
  backend_version?: string | null;
  client_ip?: string | null;
  collectors_online?: number | null;
  collectors_total?: number | null;
};

type DiagnosticsState = {
  dbStatus: DbStatus;
  handshakeLatencyMs: number | null;
  serverTime: string | null;
  backendVersion: string | null;
  collectorsOnline: number | null;
  collectorsTotal: number | null;
};

type ConnectionInfo = {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
};

type MemorySnapshot = {
  used: number;
  total: number;
  percent: number;
};

type NavigatorConnection = ConnectionInfo & {
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
};

const getNavigatorConnection = (): NavigatorConnection | undefined => {
  if (typeof navigator === "undefined") return undefined;
  return (
    (navigator as Navigator & { connection?: NavigatorConnection; mozConnection?: NavigatorConnection; webkitConnection?: NavigatorConnection })
      .connection ??
    (navigator as Navigator & { connection?: NavigatorConnection; mozConnection?: NavigatorConnection; webkitConnection?: NavigatorConnection }).mozConnection ??
    (navigator as Navigator & { connection?: NavigatorConnection; mozConnection?: NavigatorConnection; webkitConnection?: NavigatorConnection }).webkitConnection
  );
};

const getConnectionDetails = (): ConnectionInfo => {
  const connection = getNavigatorConnection();
  if (!connection) return {};
  const { effectiveType, downlink, rtt } = connection;
  return { effectiveType, downlink, rtt };
};

const formatConnectionLabel = (info: ConnectionInfo): string => {
  const parts: string[] = [];
  if (info.effectiveType) {
    parts.push(info.effectiveType.toUpperCase());
  }
  if (typeof info.downlink === "number") {
    parts.push(`${info.downlink.toFixed(1)}Mbps`);
  }
  if (typeof info.rtt === "number" && info.rtt > 0) {
    parts.push(`${info.rtt}ms`);
  }
  return parts.length ? parts.join(" / ") : "link pending";
};

const getConnectionSpeedFactor = (info: ConnectionInfo): number => {
  let factor = 1;
  if (typeof info.downlink === "number") {
    if (info.downlink >= 50) factor = 0.6;
    else if (info.downlink >= 20) factor = 0.75;
    else if (info.downlink >= 10) factor = 0.9;
    else if (info.downlink >= 2) factor = 1;
    else factor = 1.2;
  }

  if (info.effectiveType === "slow-2g") factor += 0.6;
  else if (info.effectiveType === "2g") factor += 0.4;
  else if (info.effectiveType === "3g") factor += 0.2;

  return Math.min(Math.max(factor, 0.6), 1.6);
};

  const captureMemoryUsage = (): MemorySnapshot | null => {
    if (typeof window === "undefined") return null;
    const performanceWithMemory = performance as Performance & {
      memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
    };
    const perfMemory = performanceWithMemory.memory;
    if (perfMemory) {
      const used = perfMemory.usedJSHeapSize / 1024 / 1024 / 1024;
      const total = perfMemory.jsHeapSizeLimit / 1024 / 1024 / 1024;
      const percent = Math.min(100, Math.round((used / total) * 100));
      return { used, total, percent };
    }
    const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (typeof deviceMemory === "number") {
      return { used: deviceMemory, total: deviceMemory, percent: Math.round(100) };
    }
    return null;
  };


const formatMemoryLabel = (snapshot: MemorySnapshot | null): string => {
  if (!snapshot) return "Detecting...";
  const used = `${snapshot.used.toFixed(2)} GB`;
  const total = `${snapshot.total.toFixed(1)} GB`;
  return `${snapshot.percent}% (${used} / ${total})`;
};

const formatNetworkThroughput = (info: ConnectionInfo): string => {
  if (typeof info.downlink === "number") {
    return `${info.downlink.toFixed(1)} Mbps`;
  }
  return "Detecting...";
};

const formatLatencyLabel = (latency: number | null): string => {
  if (typeof latency !== "number") return "Detecting...";
  if (latency < 1) return "<1 ms";
  return `${Math.round(latency)} ms`;
};

const formatDbStatusLabel = (status: DbStatus | string | null): string => {
  if (!status) return "pending";
  const normalized = status.toLowerCase() as DbStatus;
  switch (normalized) {
    case "ok":
      return "ONLINE";
    case "degraded":
      return "DEGRADED";
    case "error":
      return "ERROR";
    default:
      return status.toUpperCase();
  }
};

const formatServerTimestamp = (iso: string | null): string => {
  if (!iso) return "pending";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString();
};

const decodeJwt = (token: string): Record<string, unknown> | null => {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(normalized);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
};

const computeTokenTTLMinutes = (token: string): number | null => {
  const payload = decodeJwt(token);
  if (!payload || typeof payload.exp !== "number") return null;
  const diff = payload.exp * 1000 - Date.now();
  if (diff <= 0) return null;
  return Math.round(diff / 60000);
};

  const bootSteps: SequenceStep[] = [
    {
      getText: () => "[SYS ] Initializing secure boot sequence",
      minDelay: 400,
      jitter: 0,
    },
    {
      getText: () => "[SYS ] Loading tactical UI modules",
      minDelay: 320,
      jitter: 0,
    },
    {
      getText: () => "[SYS ] Establishing encrypted channel",
      minDelay: 300,
      jitter: 0,
    },
    {
      getText: () => "[NET ] Network handshake verified",
      minDelay: 280,
      jitter: 0,
    },
    {
      getText: () => "[DB  ] Backend diagnostics complete",
      minDelay: 260,
      jitter: 0,
    },
    {
      getText: (context) =>
        context.logoutReason === "manual"
          ? "[AUTH] Operator logout acknowledged"
          : context.logoutReason === "timeout"
          ? "[AUTH] Session expired — logout enforced"
          : context.logoutReason === "forced"
          ? "[AUTH] Administrative logout enforced"
          : "[AUTH] Security checks complete",
      minDelay: 240,
      jitter: 0,
    },
    {
      getText: () => "[SYS ] Operator console ready",
      minDelay: 200,
      jitter: 0,
    },
  ];


  const preAuthSteps: SequenceStep[] = [
    { getText: (ctx) => `[AUTH] Validating credentials for ${ctx.username ? ctx.username.toUpperCase() : "OPERATOR"}...`, minDelay: 0, jitter: 0 },
    { getText: (ctx) => `[AUTH] Checking ${ctx.role.toUpperCase()} access level policies...`, minDelay: 360, jitter: 0 },
    { getText: () => "[SEC ] Verifying security clearance tokens...", minDelay: 360, jitter: 0 },
    { getText: (ctx) => `[SYS ] Establishing secure session via ${ctx.connectionLabel || "network"}...`, minDelay: 400, jitter: 0 },
  ];

  const successAuthSteps: SequenceStep[] = [
    { getText: (ctx) => `[SYS ] Session token generated${ctx.tokenTTLMinutes ? ` · TTL ${ctx.tokenTTLMinutes}m` : ""}`, minDelay: 260, jitter: 0 },
    { getText: (ctx) => `[LOG ] Access logged to audit trail (IP ${ctx.clientIp ?? "unknown"})`, minDelay: 320, jitter: 0 },
    { getText: () => "[RDY ] Authentication successful", minDelay: 340, jitter: 0 },
    { getText: () => "[NAV ] Redirecting to command center...", minDelay: 360, jitter: 0 },
  ];

  const failureAuthSteps: SequenceStep[] = [
    { getText: (ctx) => `[FAIL] Credential verification failed for ${ctx.username ? ctx.username.toUpperCase() : "OPERATOR"}`, minDelay: 0, jitter: 0 },
    { getText: (ctx) => `[LOG ] Unauthorized attempt recorded · Public IP ${ctx.clientIp ?? "unknown"}`, minDelay: 320, jitter: 0 },
  ];


const AUTH_STAGE_LABELS = ["CRED", "PERM", "SEC", "SES"];

  const playSequence = async (
    steps: SequenceStep[],
    contextRef: React.MutableRefObject<SequenceContext>,
    addMessage: (message: string) => void,
    options: { speedFactor: number; shouldContinue?: () => boolean; isMounted: () => boolean },
  ) => {
    const { speedFactor, shouldContinue, isMounted } = options;
    for (let index = 0; index < steps.length; index++) {
      const step = steps[index];
      if (index !== 0 || step.minDelay > 0) {
        await wait(step.minDelay, speedFactor, step.jitter);
      }
      if (!isMounted()) return;
      const message = step.getText(contextRef.current);
      addMessage(message);
      if (shouldContinue && !shouldContinue()) {
        return;
      }
    }
  };

  const wait = async (minDelay: number, speedFactor: number, jitter?: number) => {
    const jitterMs = jitter ?? 0;
    const delay = Math.max(100, minDelay * speedFactor + jitterMs);
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
  };


const parseErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    try {
      const parsed = JSON.parse(error.message) as { detail?: string };
      if (parsed?.detail) {
        return parsed.detail;
      }
    } catch {
      // ignore JSON parsing issues
    }

    if (/401/.test(error.message) || /Invalid credentials/i.test(error.message)) {
      return "Invalid credentials";
    }

    if (error.message.trim().length > 0) {
      return error.message;
    }
  }

  return "Authentication failed. Please verify your credentials and try again.";
};

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"operator" | "viewer">("operator");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isBooting, setIsBooting] = useState(true);
  const [bootMessages, setBootMessages] = useState<string[]>([]);
  const [bootComplete, setBootComplete] = useState(false);
  const [authMessages, setAuthMessages] = useState<string[]>([]);
  const [authTotalSteps, setAuthTotalSteps] = useState(preAuthSteps.length + successAuthSteps.length);
  const [authFailureDialogOpen, setAuthFailureDialogOpen] = useState(false);
  const [authFailureMessage, setAuthFailureMessage] = useState<string>("");
  const [logoutReason, setLogoutReason] = useState<string | null>(null);
  const [logoutTimestamp, setLogoutTimestamp] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsState>({
    dbStatus: "unknown",
    handshakeLatencyMs: null,
    serverTime: null,
    backendVersion: null,
    collectorsOnline: null,
    collectorsTotal: null,
  });

  const connectionInfoRef = useRef<ConnectionInfo>(getConnectionDetails());
  const [connectionLabel, setConnectionLabel] = useState(formatConnectionLabel(connectionInfoRef.current));
  const connectionLabelRef = useRef(connectionLabel);
  const [clientIp, setClientIp] = useState<string | null>(null);

  const bootContextRef = useRef<SequenceContext>({
    username: "",
    role: "",
    tokenTTLMinutes: null,
    clientIp: null,
    connectionLabel,
    dbStatus: "unknown",
    handshakeLatencyMs: null,
    serverTime: null,
    backendVersion: null,
    logoutReason: null,
  });
  const authContextRef = useRef<SequenceContext>({
    username: "",
    role: "",
    tokenTTLMinutes: null,
    clientIp: null,
    connectionLabel,
    dbStatus: "unknown",
    handshakeLatencyMs: null,
    serverTime: null,
    backendVersion: null,
    logoutReason: null,
  });

  const [systemStats, setSystemStats] = useState({
    cpu: null as number | null,
    memoryLabel: "Detecting...",
    networkLabel: formatNetworkThroughput(connectionInfoRef.current),
  });

  const connectionSpeedFactorRef = useRef(getConnectionSpeedFactor(connectionInfoRef.current));

  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const connection = getNavigatorConnection();
    const updateConnection = () => {
      connectionInfoRef.current = getConnectionDetails();
      connectionSpeedFactorRef.current = getConnectionSpeedFactor(connectionInfoRef.current);
      const label = formatConnectionLabel(connectionInfoRef.current);
      connectionLabelRef.current = label;
      setConnectionLabel(label);
      setSystemStats((prev) => ({
        ...prev,
        networkLabel: formatNetworkThroughput(connectionInfoRef.current),
      }));
    };

    updateConnection();

    connection?.addEventListener?.("change", updateConnection);

    return () => {
      connection?.removeEventListener?.("change", updateConnection);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setClientIp(null);
  }, []);

  const normalizeDbStatus = (status?: string | null): DbStatus => {
    if (!status) return "unknown";
    const normalized = status.toLowerCase();
    if (normalized === "ok" || normalized === "degraded" || normalized === "error") {
      return normalized;
    }
    return "unknown";
  };

  useEffect(() => {
    let cancelled = false;

    const fetchDiagnostics = async () => {
      try {
        const start = performance.now();
        const response = await fetch(`${API_BASE_URL}/status/diagnostics`);
        const latency = performance.now() - start;
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const data = (await response.json()) as DiagnosticsResponse;
        if (cancelled) return;
        const newDiagnostics: DiagnosticsState = {
          dbStatus: normalizeDbStatus(data.db_status),
          handshakeLatencyMs: latency,
          serverTime: data.server_time ?? null,
          backendVersion: data.backend_version ?? null,
          collectorsOnline: data.collectors_online ?? null,
          collectorsTotal: data.collectors_total ?? null,
        };
        setDiagnostics(newDiagnostics);
        bootContextRef.current = {
          ...bootContextRef.current,
          dbStatus: newDiagnostics.dbStatus,
          handshakeLatencyMs: newDiagnostics.handshakeLatencyMs,
          serverTime: newDiagnostics.serverTime,
          backendVersion: newDiagnostics.backendVersion,
          clientIp: data.client_ip ?? bootContextRef.current.clientIp,
        };
        authContextRef.current = {
          ...authContextRef.current,
          dbStatus: newDiagnostics.dbStatus,
          handshakeLatencyMs: newDiagnostics.handshakeLatencyMs,
          serverTime: newDiagnostics.serverTime,
          backendVersion: newDiagnostics.backendVersion,
          clientIp: data.client_ip ?? authContextRef.current.clientIp,
        };
        if (data.client_ip && !clientIp) {
          setClientIp(data.client_ip);
        }
      } catch {
      }
    };

    const timeout = setTimeout(fetchDiagnostics, 150);
    const interval = setInterval(fetchDiagnostics, 30000);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [clientIp]);

  useEffect(() => {
    bootContextRef.current = {
      ...bootContextRef.current,
      dbStatus: diagnostics.dbStatus,
      handshakeLatencyMs: diagnostics.handshakeLatencyMs,
      serverTime: diagnostics.serverTime,
      backendVersion: diagnostics.backendVersion,
    };
    authContextRef.current = {
      ...authContextRef.current,
      dbStatus: diagnostics.dbStatus,
      handshakeLatencyMs: diagnostics.handshakeLatencyMs,
      serverTime: diagnostics.serverTime,
      backendVersion: diagnostics.backendVersion,
    };
  }, [diagnostics]);

  useEffect(() => {
    const stored = localStorage.getItem("dfir_logout_reason");
    const stateReason = (location.state as { logoutReason?: string } | null)?.logoutReason ?? null;
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { reason?: string; timestamp?: string };
        if (parsed.reason) {
          setLogoutReason(parsed.reason);
          setLogoutTimestamp(parsed.timestamp ?? null);
        }
      } catch {
      }
    }
    if (stateReason) {
      setLogoutReason(stateReason);
      setLogoutTimestamp(new Date().toISOString());
    }
  }, [location.state]);

  useEffect(() => {
    if (!authFailureDialogOpen) return;
    if (clientIp) return;
    const fetchPublicIp = async () => {
      try {
        const response = await fetch("https://api.ipify.org?format=json");
        if (!response.ok) return;
        const data = (await response.json()) as { ip?: string };
        if (data.ip) {
          setClientIp(data.ip);
          authContextRef.current.clientIp = data.ip;
        }
      } catch {
      }
    };
    fetchPublicIp();
  }, [authFailureDialogOpen, clientIp]);

  useEffect(() => {
    if (!logoutReason) return;
    authContextRef.current.logoutReason = logoutReason;
    bootContextRef.current.logoutReason = logoutReason;
  }, [logoutReason]);

  useEffect(() => {
    bootContextRef.current.connectionLabel = connectionLabel;
    authContextRef.current.connectionLabel = connectionLabel;
  }, [connectionLabel]);

  useEffect(() => {
    bootContextRef.current.clientIp = clientIp;
    authContextRef.current.clientIp = clientIp;
  }, [clientIp]);

  // Boot sequence effect
  useEffect(() => {
    let cancelled = false;
    setBootMessages([]);

    const run = async () => {
      bootContextRef.current = {
        ...bootContextRef.current,
        username: "",
        role: "",
        tokenTTLMinutes: null,
        clientIp,
        connectionLabel: connectionLabelRef.current,
        logoutReason,
      };
      await playSequence(
        bootSteps,
        bootContextRef,
        (message) => {
          if (!cancelled && isMountedRef.current) {
            setBootMessages((prev) => (prev.includes(message) ? prev : [...prev, message]));
          }
        },
        {
          speedFactor: connectionSpeedFactorRef.current,
          isMounted: () => isMountedRef.current && !cancelled,
        },
      );
      if (!cancelled && isMountedRef.current) {
        setIsBooting(false);
        setBootComplete(true);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [clientIp]);

  // Simulate system stats during boot/auth
  useEffect(() => {
    if (!isBooting && !isLoading) return;

    const updateStats = () => {
      const memorySnapshot = captureMemoryUsage();
      setSystemStats({
        cpu: null,
        memoryLabel: formatMemoryLabel(memorySnapshot),
        networkLabel: formatNetworkThroughput(connectionInfoRef.current),
      });
    };

    updateStats();
    const interval = setInterval(updateStats, 1000);

    return () => clearInterval(interval);
  }, [isBooting, isLoading]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);
    setAuthMessages([]);
    setAuthTotalSteps(preAuthSteps.length + successAuthSteps.length);
    authContextRef.current = {
      ...authContextRef.current,
      username,
      role,
      tokenTTLMinutes: null,
      clientIp,
      connectionLabel: connectionLabelRef.current,
      logoutReason: null,
    };
    setAuthFailureDialogOpen(false);
    setAuthFailureMessage("");
    setLogoutReason(null);
    setLogoutTimestamp(null);
    localStorage.removeItem("dfir_logout_reason");

    const pushMessage = (message: string) => {
      setAuthMessages((prev) => {
        if (prev.includes(message)) return prev;
        return [...prev, message];
      });
    };

    const runPreAuth = async () => {
      setAuthMessages([]);
      await playSequence(preAuthSteps, authContextRef, pushMessage, {
        speedFactor: connectionSpeedFactorRef.current,
        isMounted: () => isMountedRef.current,
      });
    };

    const completeSequence = async (steps: SequenceStep[]) => {
      await playSequence(steps, authContextRef, pushMessage, {
        speedFactor: connectionSpeedFactorRef.current,
        isMounted: () => isMountedRef.current,
      });
    };

    const execute = async () => {
      await runPreAuth();

      try {
        const { apiPost, apiGet } = await import("@/lib/api");
        const response = await apiPost<{ access_token: string }>("/auth/login", {
          username,
          password,
          role,
        });

        if (!clientIp) {
          try {
            const diag = await apiGet<DiagnosticsResponse>("/status/diagnostics");
            if (diag.client_ip) {
              setClientIp(diag.client_ip);
              authContextRef.current.clientIp = diag.client_ip;
            }
            } catch {
            }

        }

        const ttl = computeTokenTTLMinutes(response.access_token);
        authContextRef.current.tokenTTLMinutes = ttl;

        await completeSequence(successAuthSteps);

        localStorage.setItem(
          "dfir_auth",
          JSON.stringify({ username, role, token: response.access_token })
        );

        try {
          const me = await apiGet<CurrentUserResponse>("/users/me");
          localStorage.setItem(
            "dfir_auth",
            JSON.stringify({
              username: me.username,
              role: me.role,
              token: response.access_token,
            })
          );
        } catch {
          // fallback to provided role
        }

        await wait(350, 1, 0);
        navigate("/dashboard");
      } catch (error) {
        localStorage.removeItem("dfir_auth");
        setAuthTotalSteps(preAuthSteps.length + failureAuthSteps.length);
        await completeSequence(failureAuthSteps);
        if (isMountedRef.current) {
          const message = parseErrorMessage(error);
          setErrorMessage(message);
          setAuthFailureMessage(message || "Invalid username or password.");
          setAuthFailureDialogOpen(true);
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    execute();
  };

  // Boot screen
  if (isBooting) {
    const bootProgress = bootSteps.length
      ? Math.min(1, bootMessages.length / bootSteps.length)
      : 0;
    return (
      <>
        <Dialog open={authFailureDialogOpen} onOpenChange={setAuthFailureDialogOpen}>
          <DialogContent className="bg-background border border-destructive/40 text-foreground max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                ACCESS DENIED
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {authFailureMessage || "Invalid username or password."}
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 space-y-2 text-sm font-mono">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Public IP</span>
                <span>{clientIp ?? "unknown"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Connection</span>
                <span>{connectionLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Timestamp</span>
                <span>{new Date().toLocaleTimeString()}</span>
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button variant="tactical" onClick={() => setAuthFailureDialogOpen(false)}>
                RETRY AUTH
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <div className="min-h-screen bg-background flex flex-col">
        <WarningBanner variant="critical" className="border-x-0 border-t-0">
          RESTRICTED SYSTEM — AUTHORIZED PERSONNEL ONLY — ALL ACCESS IS LOGGED AND MONITORED
        </WarningBanner>

        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-2xl">
            {/* Boot Header */}
            <div className="border border-border bg-card p-4 mb-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="relative">
                  <Shield className="w-8 h-8 text-primary animate-pulse" />
                  <div className="absolute inset-0 w-8 h-8 border border-primary/50 animate-ping" />
                </div>
                <div>
                  <h1 className="font-mono text-lg font-bold text-primary text-glow-green">
                    DFIR RAPID COLLECTION KIT
                  </h1>
                  <p className="font-mono text-xs text-muted-foreground">
                    SYSTEM INITIALIZATION IN PROGRESS
                  </p>
                </div>
              </div>

              {/* System Stats */}
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="flex items-center gap-2 font-mono text-xs">
                  <Cpu className="w-4 h-4 text-primary" />
                  <span className="text-muted-foreground">CPU:</span>
                  <span className="text-primary">
                    {typeof systemStats.cpu === "number" ? `${systemStats.cpu}%` : "Detecting..."}
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs">
                  <Server className="w-4 h-4 text-warning" />
                  <span className="text-muted-foreground">MEM:</span>
                  <span className="text-warning">{systemStats.memoryLabel}</span>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs">
                  <Radio className="w-4 h-4 text-primary" />
                  <span className="text-muted-foreground">NET:</span>
                  <span className="text-primary">{systemStats.networkLabel}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="flex items-center gap-2 font-mono text-xs">
                  <Radar className="w-4 h-4 text-primary" />
                  <span className="text-muted-foreground">HANDSHAKE:</span>
                  <span className="text-primary">{formatLatencyLabel(diagnostics.handshakeLatencyMs)}</span>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs">
                  <Database className="w-4 h-4 text-warning" />
                  <span className="text-muted-foreground">DB:</span>
                  <span
                    className={
                      diagnostics.dbStatus === "ok"
                        ? "text-primary"
                        : diagnostics.dbStatus === "degraded"
                        ? "text-warning"
                        : diagnostics.dbStatus === "error"
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }
                  >
                    {formatDbStatusLabel(diagnostics.dbStatus)}
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs">
                  <Terminal className="w-4 h-4 text-primary" />
                  <span className="text-muted-foreground">BUILD:</span>
                  <span className="text-primary">{diagnostics.backendVersion ?? "Detecting..."}</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="h-1 bg-secondary overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300 ease-out"
                  style={{ width: `${Math.round(bootProgress * 100)}%` }}
                />
              </div>
            </div>

            {/* Terminal Output */}
            <div className="border border-border bg-background/80 p-4 font-mono text-sm max-h-80 overflow-y-auto">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                <Terminal className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground text-xs">SYSTEM BOOT LOG</span>
              </div>
              {bootMessages.map((msg, index) => (
                <div 
                  key={index} 
                  className={`py-0.5 ${
                    msg.includes("✓") ? "text-primary" : 
                    msg.includes("RDY") ? "text-primary text-glow-green" : 
                    "text-foreground"
                  }`}
                >
                  <span className="text-muted-foreground mr-2">
                    {new Date().toTimeString().slice(0, 8)}
                  </span>
                  {msg}
                </div>
              ))}
              <div className="text-primary mt-1">
                <span className="cursor-blink">█</span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-border bg-secondary px-4 py-2 flex items-center justify-between font-mono text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 bg-warning rounded-full animate-pulse" />
            INITIALIZING...
          </span>
          <span>{Math.round(bootProgress * 100)}% COMPLETE</span>
          <span>{new Date().toISOString()}</span>
        </div>
      </div>
      </>
    );
  }

  const systemStatusLabel = diagnostics.dbStatus === "ok"
    ? "OPERATIONAL"
    : diagnostics.dbStatus === "degraded"
      ? "DEGRADED"
      : diagnostics.dbStatus === "error"
        ? "OFFLINE"
        : "UNKNOWN";

  const collectorsLabel = diagnostics.collectorsOnline == null
    ? "COLLECTORS: --"
    : `COLLECTORS: ${diagnostics.collectorsOnline} ONLINE${
        diagnostics.collectorsTotal == null ? "" : ` / ${diagnostics.collectorsTotal} TOTAL`
      }`;

  const statusTimestamp = diagnostics.serverTime
    ? new Date(diagnostics.serverTime).toISOString()
    : new Date().toISOString();

  const loginScreen = (
    <>
      <Dialog open={authFailureDialogOpen} onOpenChange={setAuthFailureDialogOpen}>
        <DialogContent className="bg-background border border-destructive/40 text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              AUTH VALIDATION FAILED
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {authFailureMessage || "Invalid username or password."}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-2 text-sm font-mono">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Public IP</span>
              <span>{clientIp ?? "unknown"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Connection</span>
              <span>{connectionLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Timestamp</span>
              <span>{new Date().toLocaleTimeString()}</span>
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="tactical" onClick={() => setAuthFailureDialogOpen(false)}>
              RETRY AUTH
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="min-h-screen bg-background tactical-grid flex flex-col">
        {/* Top Warning Banner */}
        <WarningBanner variant="critical" className="border-x-0 border-t-0">
          RESTRICTED SYSTEM — AUTHORIZED PERSONNEL ONLY — ALL ACCESS IS LOGGED AND MONITORED
        </WarningBanner>

        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-md space-y-8">
            {/* Logo / Header */}
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-20 h-20 border-2 border-primary/30 bg-card relative">
                <Shield className="w-10 h-10 text-primary" />
                {bootComplete && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full animate-pulse" />
                )}
              </div>
              <div className="space-y-2">
                <h1 className="font-mono text-2xl font-bold tracking-wider text-foreground">
                  DFIR RAPID COLLECTION KIT
                </h1>
                <p className="font-mono text-sm text-muted-foreground uppercase tracking-wider">
                  Evidence Collection System v2.1.0
                </p>
                {bootComplete && (
                  <p className="font-mono text-xs text-primary">
                    ● SYSTEM READY
                  </p>
                )}
              </div>
            </div>

            {/* Login Form */}
            {errorMessage && (
              <Alert variant="destructive" className="border-destructive/50 bg-destructive/10 text-destructive-foreground">
                <AlertCircle className="h-4 w-4" />
                <div>
                  <AlertTitle>Access Denied</AlertTitle>
                  <AlertDescription>{errorMessage}</AlertDescription>
                </div>
              </Alert>
            )}

            <form onSubmit={handleLogin} className="space-y-6">
              <div className="border border-border bg-card p-6 space-y-6">
                <div className="panel-header -mx-6 -mt-6 mb-6">
                  <Lock className="w-4 h-4" />
                  <span>SYSTEM ACCESS</span>
                </div>

                {/* Username */}
                <div className="space-y-2">
                  <FormLabel>
                    Username
                  </FormLabel>
                  <InputWithIcon
                    icon={<User className="w-4 h-4" />}
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      if (errorMessage) {
                        setErrorMessage(null);
                      }
                    }}
                    placeholder="Enter username"
                    required
                  />
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <FormLabel>
                    Password
                  </FormLabel>
                  <InputWithIcon
                    icon={<Lock className="w-4 h-4" />}
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errorMessage) {
                        setErrorMessage(null);
                      }
                    }}
                    placeholder="Enter password"
                    required
                  />
                </div>

                {/* Role Selection */}
                <div className="space-y-2">
                  <FormLabel>
                    Access Level
                  </FormLabel>
                  <div className="grid grid-cols-2 gap-3">
                    <SelectableButton
                      type="button"
                      isActive={role === "operator"}
                      onClick={() => {
                        setRole("operator");
                        if (errorMessage) {
                          setErrorMessage(null);
                        }
                      }}
                      className="p-3"
                      activeClassName="border-primary bg-primary/10 text-primary glow-green"
                      inactiveClassName="border-border bg-secondary text-muted-foreground hover:border-muted-foreground"
                    >
                      Operator
                    </SelectableButton>
                    <SelectableButton
                      type="button"
                      isActive={role === "viewer"}
                      onClick={() => {
                        setRole("viewer");
                        if (errorMessage) {
                          setErrorMessage(null);
                        }
                      }}
                      className="p-3"
                      activeClassName="border-primary bg-primary/10 text-primary glow-green"
                      inactiveClassName="border-border bg-secondary text-muted-foreground hover:border-muted-foreground"
                    >
                      Viewer
                    </SelectableButton>
                  </div>
                </div>

                {/* Submit */}
                <Button
                  type="submit"
                  variant="tactical"
                  className="w-full"
                  disabled={isLoading}
                >
                  ACCESS SYSTEM
                </Button>
              </div>
            </form>

            {/* Footer */}
            <div className="text-center space-y-2">
              <p className="font-mono text-xs text-muted-foreground">
                SESSION TIMEOUT: 15 MINUTES IDLE
              </p>
              <p className="font-mono text-xs text-destructive">
                UNAUTHORIZED ACCESS IS A CRIMINAL OFFENSE
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Status Bar */}
        <div className="border-t border-border bg-secondary px-4 py-2 flex items-center justify-between font-mono text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 bg-primary rounded-full" />
            SYS: {systemStatusLabel}
          </span>
          <span>{collectorsLabel}</span>
          <span>{statusTimestamp}</span>
        </div>
      </div>
    </>
  );

  if (isLoading) {
    return loginScreen;
  }

  return loginScreen;
}

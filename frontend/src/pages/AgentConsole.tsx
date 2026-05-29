/**
 * AgentConsole — real-time live command interface (R-1: Live Agent Commands).
 *
 * Opens a WebSocket to the backend which queues commands for the connected agent
 * and streams output back in real time, without a full collection job.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Send, Terminal, Wifi, WifiOff, AlertTriangle } from "lucide-react";
import { getStoredAuth } from "@/lib/auth";

type OutputLine = {
  ts: string;
  type: "input" | "output" | "error" | "info";
  text: string;
};

const WS_BASE = (() => {
  const loc = window.location;
  const proto = loc.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${loc.host}/api/v1/agent-commands/ws`;
})();

export default function AgentConsole() {
  const navigate = useNavigate();
  const { agentId } = useParams<{ agentId: string }>();
  const [lines, setLines] = useState<OutputLine[]>([]);
  const [cmd, setCmd] = useState("");
  const [timeoutSec, setTimeoutSec] = useState(30);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const historyRef = useRef<string[]>([]);
  const histIdxRef = useRef(-1);

  const addLine = (type: OutputLine["type"], text: string) =>
    setLines((prev) => [
      ...prev,
      { ts: new Date().toLocaleTimeString("en-US", { hour12: false }), type, text },
    ]);

  const connect = () => {
    if (wsRef.current) return;
    const auth = getStoredAuth();
    if (!auth?.token) { setWsError("Not authenticated"); return; }
    setConnecting(true);
    setWsError(null);

    const ws = new WebSocket(`${WS_BASE}/${agentId}?token=${encodeURIComponent(auth.token)}`);

    ws.onopen = () => {
      setConnected(true);
      setConnecting(false);
      addLine("info", `Connected to agent ${agentId}. Type a command and press Enter.`);
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as {
          type: string; chunk?: string; message?: string; exit_code?: number;
        };
        if (msg.type === "output" && msg.chunk) addLine("output", msg.chunk.trimEnd());
        else if (msg.type === "done") addLine("info", `--- exit code: ${msg.exit_code ?? 0} ---`);
        else if (msg.type === "error") addLine("error", msg.message ?? "Unknown error");
        else if (msg.type === "queued") addLine("info", msg.message ?? "Command queued");
        // ping: silent
      } catch {
        addLine("error", "Invalid message from server");
      }
    };

    ws.onclose = (e) => {
      setConnected(false);
      setConnecting(false);
      wsRef.current = null;
      addLine("info", e.code !== 1000 ? `Disconnected (${e.code}: ${e.reason || "closed"})` : "Disconnected.");
    };

    ws.onerror = () => setWsError("WebSocket error — check backend connectivity");

    wsRef.current = ws;
  };

  const disconnect = () => {
    wsRef.current?.close(1000, "User disconnect");
    wsRef.current = null;
    setConnected(false);
  };

  useEffect(() => () => { wsRef.current?.close(1000); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [lines]);

  const sendCommand = () => {
    const c = cmd.trim();
    if (!c || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    addLine("input", `$ ${c}`);
    historyRef.current = [c, ...historyRef.current.slice(0, 49)];
    histIdxRef.current = -1;
    wsRef.current.send(JSON.stringify({ cmd: c, timeout_sec: timeoutSec }));
    setCmd("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { sendCommand(); }
    else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = histIdxRef.current + 1;
      if (next < historyRef.current.length) { histIdxRef.current = next; setCmd(historyRef.current[next]); }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = histIdxRef.current - 1;
      histIdxRef.current = next < 0 ? -1 : next;
      setCmd(next < 0 ? "" : historyRef.current[next]);
    }
  };

  const colors: Record<OutputLine["type"], string> = {
    input: "text-primary",
    output: "text-foreground",
    error: "text-destructive",
    info: "text-muted-foreground",
  };

  return (
    <AppLayout
      title="AGENT CONSOLE"
      subtitle={`Live command interface — ${agentId}`}
      headerActions={
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ChevronLeft className="w-4 h-4 mr-2" />BACK
        </Button>
      }
    >
      <div className="p-6 flex flex-col gap-4 max-w-4xl mx-auto w-full">
        <TacticalPanel title="CONNECTION" status={connected ? "online" : connecting ? "active" : "warning"}>
          <div className="flex items-center gap-3 font-mono text-xs flex-wrap">
            <div className="flex items-center gap-2">
              {connected
                ? <Wifi className="w-4 h-4 text-primary" />
                : <WifiOff className="w-4 h-4 text-muted-foreground" />}
              <span className={connected ? "text-primary" : "text-muted-foreground"}>
                {connected ? "CONNECTED" : connecting ? "CONNECTING..." : "DISCONNECTED"}
              </span>
            </div>
            <span className="text-muted-foreground">Agent: {agentId}</span>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-muted-foreground">Timeout:</span>
              <select
                className="h-6 px-1 bg-background border border-input rounded-sm text-xs"
                value={timeoutSec}
                onChange={(e) => setTimeoutSec(parseInt(e.target.value, 10))}
                disabled={connected}
              >
                {[10, 30, 60, 120, 300].map((t) => <option key={t} value={t}>{t}s</option>)}
              </select>
              {connected
                ? <Button variant="destructive" size="sm" className="h-6 text-xs" onClick={disconnect}>DISCONNECT</Button>
                : <Button variant="tactical" size="sm" className="h-6 text-xs" onClick={connect} disabled={connecting}>CONNECT</Button>}
            </div>
          </div>
          {wsError && (
            <div className="mt-2 flex items-center gap-2 text-xs text-destructive font-mono">
              <AlertTriangle className="w-3 h-3 shrink-0" />{wsError}
            </div>
          )}
        </TacticalPanel>

        <TacticalPanel
          title="TERMINAL"
          status={connected ? "active" : "warning"}
          headerActions={
            <button className="font-mono text-xs text-muted-foreground hover:text-foreground" onClick={() => setLines([])}>
              CLEAR
            </button>
          }
        >
          <div className="min-h-[400px] max-h-[550px] overflow-y-auto bg-black/50 rounded-sm p-3 font-mono text-xs space-y-0.5">
            {lines.length === 0 && (
              <div className="text-muted-foreground">Connect to an agent then type a command.</div>
            )}
            {lines.map((line, i) => (
              <div key={i} className={`whitespace-pre-wrap break-all leading-5 ${colors[line.type]}`}>
                <span className="text-muted-foreground/40 mr-2 select-none">{line.ts}</span>
                {line.text}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-primary shrink-0" />
            <input
              className="flex-1 h-8 px-2 bg-background border border-input rounded-sm font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              placeholder={connected ? "Shell command (↑/↓ history)..." : "Connect first"}
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!connected}
              autoComplete="off"
              spellCheck={false}
            />
            <Button
              variant="tactical"
              size="sm"
              className="h-8"
              disabled={!connected || !cmd.trim()}
              onClick={sendCommand}
            >
              <Send className="w-3 h-3" />
            </Button>
          </div>
        </TacticalPanel>
      </div>
    </AppLayout>
  );
}

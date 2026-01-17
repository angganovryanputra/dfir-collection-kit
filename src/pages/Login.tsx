import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WarningBanner } from "@/components/WarningBanner";
import { Shield, Lock, User, Terminal, Cpu, Radio, Radar, Server } from "lucide-react";

// Boot sequence messages
const bootSequence = [
  { text: "[BOOT] Initializing DFIR Rapid Collection Kit v2.1.0...", delay: 0 },
  { text: "[KERN] Loading security modules...", delay: 400 },
  { text: "[KERN] Cryptographic subsystem initialized", delay: 700 },
  { text: "[NET ] Secure communication channel established", delay: 1000 },
  { text: "[AUTH] Loading authentication protocols...", delay: 1300 },
  { text: "[AUTH] Multi-factor authentication ready", delay: 1600 },
  { text: "[SYS ] Checking system integrity...", delay: 1900 },
  { text: "[SYS ] All checksums verified ✓", delay: 2200 },
  { text: "[DFIR] Collection engine standby", delay: 2500 },
  { text: "[DFIR] Evidence vault connection established", delay: 2800 },
  { text: "[STAT] 3 collectors online", delay: 3100 },
  { text: "[RDY ] System ready for authentication", delay: 3400 },
];

// Authentication sequence messages
const authSequence = [
  { text: "[AUTH] Validating credentials...", delay: 0 },
  { text: "[AUTH] Checking access level permissions...", delay: 600 },
  { text: "[SEC ] Verifying security clearance...", delay: 1200 },
  { text: "[SEC ] Clearance level verified", delay: 1800 },
  { text: "[SYS ] Establishing secure session...", delay: 2400 },
  { text: "[SYS ] Session token generated", delay: 3000 },
  { text: "[LOG ] Access logged to audit trail", delay: 3400 },
  { text: "[RDY ] Authentication successful", delay: 3800 },
  { text: "[NAV ] Redirecting to command center...", delay: 4200 },
];

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"operator" | "viewer">("operator");
  const [isLoading, setIsLoading] = useState(false);
  
  // Boot sequence states
  const [isBooting, setIsBooting] = useState(true);
  const [bootMessages, setBootMessages] = useState<string[]>([]);
  const [bootComplete, setBootComplete] = useState(false);
  
  // Auth sequence states
  const [authMessages, setAuthMessages] = useState<string[]>([]);
  const [systemStats, setSystemStats] = useState({
    cpu: 0,
    memory: 0,
    network: 0,
  });

  // Boot sequence effect
  useEffect(() => {
    bootSequence.forEach((msg, index) => {
      setTimeout(() => {
        setBootMessages((prev) => [...prev, msg.text]);
        if (index === bootSequence.length - 1) {
          setTimeout(() => {
            setIsBooting(false);
            setBootComplete(true);
          }, 800);
        }
      }, msg.delay);
    });
  }, []);

  // Simulate system stats during boot
  useEffect(() => {
    if (!isBooting && !isLoading) return;
    
    const interval = setInterval(() => {
      setSystemStats({
        cpu: Math.floor(Math.random() * 30) + 10,
        memory: Math.floor(Math.random() * 20) + 40,
        network: Math.floor(Math.random() * 100),
      });
    }, 200);

    return () => clearInterval(interval);
  }, [isBooting, isLoading]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setAuthMessages([]);

    // Run auth sequence
    for (let i = 0; i < authSequence.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, authSequence[i].delay === 0 ? 0 : 400));
      setAuthMessages((prev) => [...prev, authSequence[i].text]);
    }

    // Final delay before navigation
    await new Promise((resolve) => setTimeout(resolve, 600));
    
    localStorage.setItem("dfir_auth", JSON.stringify({ username, role }));
    navigate("/dashboard");
  };

  // Boot screen
  if (isBooting) {
    return (
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
                  <span className="text-primary">{systemStats.cpu}%</span>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs">
                  <Server className="w-4 h-4 text-warning" />
                  <span className="text-muted-foreground">MEM:</span>
                  <span className="text-warning">{systemStats.memory}%</span>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs">
                  <Radio className="w-4 h-4 text-primary" />
                  <span className="text-muted-foreground">NET:</span>
                  <span className="text-primary">{systemStats.network} Mbps</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="h-1 bg-secondary overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300 ease-out"
                  style={{ width: `${(bootMessages.length / bootSequence.length) * 100}%` }}
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
          <span>{Math.round((bootMessages.length / bootSequence.length) * 100)}% COMPLETE</span>
          <span>{new Date().toISOString()}</span>
        </div>
      </div>
    );
  }

  // Auth loading screen
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <WarningBanner variant="warning" className="border-x-0 border-t-0">
          AUTHENTICATION IN PROGRESS — DO NOT CLOSE THIS WINDOW
        </WarningBanner>

        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-lg">
            {/* Auth Header */}
            <div className="border border-primary/30 bg-card p-6 mb-4 glow-green">
              <div className="flex items-center justify-center gap-4 mb-6">
                <div className="relative">
                  <Radar className="w-12 h-12 text-primary animate-spin" style={{ animationDuration: '3s' }} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Lock className="w-5 h-5 text-primary" />
                  </div>
                </div>
              </div>
              
              <div className="text-center mb-6">
                <h2 className="font-mono text-lg font-bold text-primary text-glow-green mb-2">
                  AUTHENTICATING
                </h2>
                <p className="font-mono text-xs text-muted-foreground">
                  OPERATOR: {username.toUpperCase()} | ACCESS LEVEL: {role.toUpperCase()}
                </p>
              </div>

              {/* Auth Progress Indicators */}
              <div className="grid grid-cols-4 gap-2 mb-4">
                {["CRED", "PERM", "SEC", "SES"].map((step, i) => (
                  <div 
                    key={step}
                    className={`text-center p-2 border transition-all duration-300 ${
                      authMessages.length > i * 2 + 1
                        ? "border-primary bg-primary/10 text-primary"
                        : authMessages.length > i * 2
                        ? "border-warning bg-warning/10 text-warning"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    <div className="font-mono text-xs">{step}</div>
                    {authMessages.length > i * 2 + 1 ? (
                      <div className="font-mono text-xs mt-1">✓</div>
                    ) : authMessages.length > i * 2 ? (
                      <div className="font-mono text-xs mt-1 animate-pulse">...</div>
                    ) : (
                      <div className="font-mono text-xs mt-1">○</div>
                    )}
                  </div>
                ))}
              </div>

              {/* Progress Bar */}
              <div className="h-2 bg-secondary overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-primary to-primary/50 transition-all duration-300"
                  style={{ width: `${(authMessages.length / authSequence.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Auth Log */}
            <div className="border border-border bg-background/80 p-4 font-mono text-sm max-h-48 overflow-y-auto">
              {authMessages.map((msg, index) => (
                <div 
                  key={index} 
                  className={`py-0.5 ${
                    msg.includes("successful") ? "text-primary text-glow-green" :
                    msg.includes("Redirecting") ? "text-primary" :
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

        <div className="border-t border-border bg-secondary px-4 py-2 flex items-center justify-between font-mono text-xs">
          <span className="flex items-center gap-2 text-warning">
            <span className="w-2 h-2 bg-warning rounded-full animate-pulse" />
            AUTHENTICATING
          </span>
          <span className="text-primary">CPU: {systemStats.cpu}% | MEM: {systemStats.memory}%</span>
          <span className="text-muted-foreground">{new Date().toISOString()}</span>
        </div>
      </div>
    );
  }

  return (
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
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="border border-border bg-card p-6 space-y-6">
              <div className="panel-header -mx-6 -mt-6 mb-6">
                <Lock className="w-4 h-4" />
                <span>SYSTEM ACCESS</span>
              </div>

              {/* Username */}
              <div className="space-y-2">
                <label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Username
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-10"
                    placeholder="Enter username"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    placeholder="Enter password"
                    required
                  />
                </div>
              </div>

              {/* Role Selection */}
              <div className="space-y-2">
                <label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Access Level
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRole("operator")}
                    className={`p-3 border font-mono text-xs uppercase tracking-wider transition-all ${
                      role === "operator"
                        ? "border-primary bg-primary/10 text-primary glow-green"
                        : "border-border bg-secondary text-muted-foreground hover:border-muted-foreground"
                    }`}
                  >
                    Operator
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole("viewer")}
                    className={`p-3 border font-mono text-xs uppercase tracking-wider transition-all ${
                      role === "viewer"
                        ? "border-primary bg-primary/10 text-primary glow-green"
                        : "border-border bg-secondary text-muted-foreground hover:border-muted-foreground"
                    }`}
                  >
                    Viewer
                  </button>
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
          SYS: OPERATIONAL
        </span>
        <span>COLLECTORS: 3 ONLINE</span>
        <span>{new Date().toISOString()}</span>
      </div>
    </div>
  );
}

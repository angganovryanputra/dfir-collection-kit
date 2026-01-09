import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WarningBanner } from "@/components/WarningBanner";
import { Shield, Lock, User } from "lucide-react";

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"operator" | "viewer">("operator");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    // Store auth state (in production, use proper auth)
    localStorage.setItem("dfir_auth", JSON.stringify({ username, role }));
    navigate("/dashboard");
  };

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
            <div className="inline-flex items-center justify-center w-20 h-20 border-2 border-primary/30 bg-card">
              <Shield className="w-10 h-10 text-primary" />
            </div>
            <div className="space-y-2">
              <h1 className="font-mono text-2xl font-bold tracking-wider text-foreground">
                DFIR RAPID COLLECTION KIT
              </h1>
              <p className="font-mono text-sm text-muted-foreground uppercase tracking-wider">
                Evidence Collection System v2.1.0
              </p>
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
                        ? "border-primary bg-primary/10 text-primary"
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
                        ? "border-primary bg-primary/10 text-primary"
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
                {isLoading ? (
                  <>
                    <span className="animate-pulse">AUTHENTICATING</span>
                    <span className="cursor-blink">_</span>
                  </>
                ) : (
                  "ACCESS SYSTEM"
                )}
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
        <span>SYS: OPERATIONAL</span>
        <span>COLLECTORS: 3 ONLINE</span>
        <span>{new Date().toISOString()}</span>
      </div>
    </div>
  );
}

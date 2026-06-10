import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface StatCardProps {
  icon: ReactNode;
  value: ReactNode;
  label: ReactNode;
  className?: string;
  valueClassName?: string;
  labelClassName?: string;
  onClick?: () => void;
  trend?: number[]; // Mini array for sparkline
}

export function StatCard({
  icon,
  value,
  label,
  className,
  valueClassName,
  labelClassName,
  onClick,
  trend = [40, 25, 35, 30, 45, 38, 55], // Sample default data
}: StatCardProps) {
  // Generate a simple SVG path from the trend data
  const generatePath = (data: number[]) => {
    if (data.length < 2) return "";
    const width = 100;
    const height = 30;
    const padding = 2;
    const max = Math.max(...data, 1);
    const min = Math.min(...data);
    const range = max - min || 1;
    
    return data.map((val, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - padding * 2) - padding;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    }).join(" ");
  };

  return (
    <div 
      onClick={onClick}
      className={cn(
        "border border-border bg-card p-4 transition-all duration-300 transition-spring relative overflow-hidden group hover:scale-[1.02] hover:border-primary/30 hover:shadow-[0_0_20px_rgba(21,245,116,0.1)]",
        onClick && "cursor-pointer active:scale-95",
        className
    )}>
      {/* Decorative top accent line */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-primary/80 scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left" />
      
      {/* Background HUD accent */}
      <div className="absolute -right-2 -bottom-2 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
        {icon}
      </div>

      <div className="flex items-start justify-between relative z-10">
        <div className="space-y-3 flex-1">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-secondary/50 rounded-sm text-muted-foreground group-hover:text-primary transition-colors duration-300">
              {icon}
            </div>
            <div
                className={cn(
                  "font-mono text-[9px] text-muted-foreground uppercase font-bold tracking-widest leading-none",
                  labelClassName
                )}
              >
                {label}
            </div>
          </div>
          <div
            className={cn("font-mono text-3xl font-bold tracking-tight text-foreground transition-all duration-300 group-hover:text-glow-green", valueClassName)}
          >
            {value}
          </div>
        </div>

        {/* Sparkline Visualizer */}
        <div className="w-20 h-10 self-end opacity-40 group-hover:opacity-100 transition-opacity duration-500">
            <svg viewBox="0 0 100 30" className="w-full h-full preserve-3d" preserveAspectRatio="none">
                <path
                    d={generatePath(trend)}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-primary"
                    style={{ filter: "drop-shadow(0 0 2px rgba(21,245,116,0.3))" }}
                />
            </svg>
        </div>
      </div>
    </div>
  );
}

import React, { useMemo } from "react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
} from "recharts";
import { BarChart2 } from "lucide-react";

interface SuperTimelineChartProps {
    data: Record<string, unknown>[];
    onSelectWindow: (from: string, to: string) => void;
}

export const SuperTimelineChart = React.memo(({ data, onSelectWindow }: SuperTimelineChartProps) => {
    const chartData = useMemo(() => {
        const hc = new Map<string, number>();
        for (const row of data) {
            const dt = String(row["datetime"] ?? row["timestamp"] ?? "");
            if (dt.length >= 13) {
                const hour = dt.slice(0, 13); // YYYY-MM-DD HH
                hc.set(hour, (hc.get(hour) ?? 0) + 1);
            }
        }
        return Array.from(hc.entries())
            .map(([hour, count]) => ({
                hour,
                displayHour: hour.split("T")[1] || hour.split(" ")[1] || hour,
                fullTime: hour.replace("T", " "),
                count,
            }))
            .sort((a, b) => a.hour.localeCompare(b.hour));
    }, [data]);

    if (chartData.length < 2) return null;

    return (
        <div className="px-1 pb-1 shrink-0 bg-secondary/10 border-b border-border/40">
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground uppercase tracking-wider p-2">
                <BarChart2 className="w-3 h-3 text-primary" />
                EVENT DENSITY (PER HOUR)
                <span className="ml-auto text-[8px] opacity-50">CLICK BAR TO ZOOM</span>
            </div>
            <div className="h-[80px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.2} />
                        <XAxis 
                            dataKey="displayHour" 
                            fontSize={8} 
                            tickLine={false} 
                            axisLine={false} 
                            stroke="hsl(var(--muted-foreground))"
                            interval="preserveStartEnd"
                        />
                        <YAxis 
                            fontSize={8} 
                            tickLine={false} 
                            axisLine={false} 
                            stroke="hsl(var(--muted-foreground))" 
                        />
                        <Tooltip
                            contentStyle={{ 
                                backgroundColor: "hsl(var(--card))", 
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "2px",
                                fontSize: "10px",
                                fontFamily: "var(--font-mono)"
                            }}
                            cursor={{ fill: "hsl(var(--primary))", opacity: 0.1 }}
                        />
                        <Bar 
                            dataKey="count" 
                            fill="hsl(var(--primary))" 
                            radius={[2, 2, 0, 0]}
                            onClick={(data) => {
                                if (data && data.hour) {
                                    onSelectWindow(
                                        data.hour.replace("T", " ") + ":00:00",
                                        data.hour.replace("T", " ") + ":59:59"
                                    );
                                }
                            }}
                        >
                            {chartData.map((entry, index) => (
                                <Cell 
                                    key={`cell-${index}`} 
                                    className="cursor-pointer transition-opacity hover:opacity-80"
                                    fillOpacity={0.6}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
});

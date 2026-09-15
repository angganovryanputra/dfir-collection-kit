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
    data: { start: string; end: string; count: number }[];
    onSelectWindow: (from: string, to: string) => void;
}

export const SuperTimelineChart = React.memo(({ data, onSelectWindow }: SuperTimelineChartProps) => {
    const chartData = useMemo(() => {
        return data.map(bucket => ({
            ...bucket,
            displayHour: bucket.start.slice(5, 16).replace("T", " "),
            fullTime: bucket.start,
        }));
    }, [data]);

    if (chartData.length === 0) return null;

    return (
        <div className="px-1 pb-1 shrink-0 bg-secondary/10 border-b border-border/40">
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground uppercase tracking-wider p-2">
                <BarChart2 className="w-3 h-3 text-primary" />
                EVENT DENSITY (ALL MATCHING EVENTS · UTC)
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
                                if (data && data.start) {
                                    onSelectWindow(
                                        data.start,
                                        data.end
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

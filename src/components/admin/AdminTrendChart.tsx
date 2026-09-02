import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrendPoint } from "@/lib/types.ts";

function formatShortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface AdminTrendChartProps {
  data: TrendPoint[];
  label: string;
}

export function AdminTrendChart({ data, label }: AdminTrendChartProps) {
  const chartData = data.map((d) => ({ ...d, label: formatShortDate(d.date) }));

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="admin-trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#287bff" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#287bff" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="currentColor" className="text-border" strokeOpacity={0.6} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "currentColor" }}
            className="text-text-secondary"
            axisLine={false}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "currentColor" }}
            className="text-text-secondary"
            axisLine={false}
            tickLine={false}
            width={32}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ stroke: "#287bff", strokeOpacity: 0.3 }}
            contentStyle={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--color-text-primary)",
            }}
            labelFormatter={(v) => v}
            formatter={(value) => [value, label]}
          />
          <Area type="monotone" dataKey="count" stroke="#287bff" strokeWidth={2} fill="url(#admin-trend-fill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

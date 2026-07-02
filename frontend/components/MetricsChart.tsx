"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { SeriesPoint } from "@/lib/types";

interface Props {
  title: string;
  data: SeriesPoint[];
  color: string;
  range: "weekly" | "monthly";
}

function formatDate(iso: string, range: "weekly" | "monthly") {
  const d = new Date(iso);
  return range === "weekly"
    ? d.toLocaleDateString("pt-BR", { weekday: "short" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function MetricsChart({ title, data, color, range }: Props) {
  const chartData = data.map((p) => ({ ...p, label: formatDate(p.bucket, range) }));
  const total = data.reduce((sum, p) => sum + p.count, 0);

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-display text-sm font-semibold text-ink/80">{title}</h3>
        <span className="font-mono text-xs text-ink/45">{total} no período</span>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={chartData} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="#D9DFD2" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#5C7A64" }}
            axisLine={{ stroke: "#D9DFD2" }}
            tickLine={false}
            interval={range === "monthly" ? 4 : 0}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#5C7A64" }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            width={28}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 10,
              border: "1px solid #D9DFD2",
              fontSize: 12,
              fontFamily: "var(--font-body)",
            }}
            labelStyle={{ color: "#152018", fontWeight: 600 }}
          />
          <Line
            type="monotone"
            dataKey="count"
            stroke={color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

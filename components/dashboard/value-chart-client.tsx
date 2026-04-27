"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = {
  date: string;
  value: number;
};

type Props = {
  points: Point[];
  baseCurrency: string;
};

export function ValueChartClient({ points, baseCurrency }: Props) {
  if (points.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-muted">
        Not enough history yet
      </div>
    );
  }

  const valueFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: baseCurrency,
    notation: "compact",
    maximumFractionDigits: 1,
  });

  const tooltipFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: baseCurrency,
  });

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="valueArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            stroke="var(--subtle)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: string) => {
              const d = new Date(value);
              return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            }}
          />
          <YAxis
            stroke="var(--subtle)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => valueFormatter.format(value)}
            width={70}
          />
          <Tooltip
            formatter={(value) => [
              tooltipFormatter.format(typeof value === "number" ? value : Number(value)),
              "Value",
            ]}
            labelFormatter={(label) =>
              new Date(String(label)).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })
            }
            contentStyle={{
              background: "var(--surface-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 0,
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--muted)" }}
            itemStyle={{ color: "var(--foreground)" }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--accent)"
            strokeWidth={2}
            fill="url(#valueArea)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

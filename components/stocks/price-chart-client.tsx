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
  close: number;
};

type Props = {
  points: Point[];
  currency: string;
};

export function PriceChartClient({ points, currency }: Props) {
  if (points.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-muted">
        No price history
      </div>
    );
  }

  const min = Math.min(...points.map((p) => p.close));
  const max = Math.max(...points.map((p) => p.close));
  const pad = (max - min) * 0.05 || 1;

  const valueFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const tooltipFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  });

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={points}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id="priceArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="var(--border)"
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            stroke="var(--subtle)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: string) =>
              new Date(v).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })
            }
          />
          <YAxis
            stroke="var(--subtle)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            domain={[min - pad, max + pad]}
            tickFormatter={(v: number) => valueFormatter.format(v)}
            width={70}
          />
          <Tooltip
            formatter={(value) => [
              tooltipFormatter.format(
                typeof value === "number" ? value : Number(value),
              ),
              "Close",
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
            dataKey="close"
            stroke="var(--accent)"
            strokeWidth={2}
            fill="url(#priceArea)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  cashColor,
  groupColor,
  hisaColor,
  homeAssetBucketColor,
} from "@/lib/chart-colors";

export type GroupValueChartSeries = {
  key: string;
  label: string;
  /** Index of the owning group; drives a stable, paired color. */
  groupIndex?: number;
  /** Visual treatment: equities, pure cash, or HISA band. */
  variant?: "equities" | "cash" | "hisa" | "income";
  /** Fixed color bucket for the home asset-mix timeline. */
  homeBucket?: "equities" | "cash" | "hisa" | "income";
};

type Point = Record<string, string | number>;

type Props = {
  baseCurrency: string;
  series: GroupValueChartSeries[];
  points: Point[];
};

function seriesColor(s: GroupValueChartSeries, idx: number): string {
  if (s.homeBucket) return homeAssetBucketColor(s.homeBucket);
  const gi = s.groupIndex ?? idx;
  if (s.variant === "hisa") return hisaColor(gi);
  if (s.variant === "income") return homeAssetBucketColor("income");
  return s.variant === "cash" ? cashColor(gi) : groupColor(gi);
}

export function GroupValueChartClient({ baseCurrency, series, points }: Props) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  if (points.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-muted">
        Not enough history yet
      </div>
    );
  }

  const toggle = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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
    <div className="flex flex-col gap-3">
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={points}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
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
              tickFormatter={(value: string) =>
                new Date(value).toLocaleDateString("en-US", {
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
              tickFormatter={(value: number) => valueFormatter.format(value)}
              width={70}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                let total = 0;
                for (const item of payload) {
                  total += Number(item.value ?? 0);
                }
                return (
                  <div
                    style={{
                      background: "var(--surface-elevated)",
                      border: "1px solid var(--border)",
                      borderRadius: 0,
                      fontSize: 12,
                      padding: "8px 10px",
                    }}
                  >
                    <p style={{ color: "var(--muted)", marginBottom: 6 }}>
                      {new Date(String(label)).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                    {payload.map((item) => (
                      <p
                        key={String(item.dataKey)}
                        style={{ color: "var(--foreground)", margin: "2px 0" }}
                      >
                        <span style={{ color: String(item.color) }}>● </span>
                        {item.name}:{" "}
                        {tooltipFormatter.format(Number(item.value))}
                      </p>
                    ))}
                    <p
                      style={{
                        color: "var(--foreground)",
                        marginTop: 6,
                        borderTop: "1px solid var(--border)",
                        paddingTop: 6,
                      }}
                    >
                      Total: {tooltipFormatter.format(total)}
                    </p>
                  </div>
                );
              }}
            />
            {series.map((s, idx) => {
              const color = seriesColor(s, idx);
              return (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stackId="group"
                  hide={hidden.has(s.key)}
                  stroke={color}
                  strokeWidth={1.5}
                  fill={color}
                  fillOpacity={
                    s.variant === "cash"
                      ? 0.32
                      : s.variant === "hisa"
                        ? 0.38
                        : s.variant === "income"
                          ? 0.44
                          : 0.5
                  }
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {series.map((s, idx) => {
          const color = seriesColor(s, idx);
          const off = hidden.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(s.key)}
              className="flex items-center gap-1.5 text-xs"
              style={{ opacity: off ? 0.4 : 1 }}
            >
              <span
                aria-hidden
                className="inline-block h-3 w-3 shrink-0"
                style={{ background: color }}
              />
              <span
                style={{
                  color: "var(--muted)",
                  textDecoration: off ? "line-through" : undefined,
                }}
              >
                {s.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

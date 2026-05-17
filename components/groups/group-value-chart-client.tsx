"use client";

import { useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { GROUP_PALETTE } from "@/lib/chart-colors";

const BENCHMARK_COLOR = "var(--foreground)";

export type GroupValueChartSeries = {
  key: string;
  label: string;
  /** Index of the owning group; drives a stable, paired color. */
  groupIndex?: number;
  /** Visual treatment: equities band, cash band, or benchmark line. */
  variant?: "equities" | "cash" | "benchmark";
};

type Point = Record<string, string | number>;

type Props = {
  baseCurrency: string;
  series: GroupValueChartSeries[];
  points: Point[];
};

function seriesColor(s: GroupValueChartSeries, idx: number): string {
  if (s.variant === "benchmark") return BENCHMARK_COLOR;
  return GROUP_PALETTE[(s.groupIndex ?? idx) % GROUP_PALETTE.length];
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

  const areas = series.filter((s) => s.variant !== "benchmark");
  const benchmark = series.find((s) => s.variant === "benchmark");

  return (
    <div className="flex flex-col gap-3">
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
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
                const rows: { name: string; value: number; color: string }[] =
                  [];
                let benchmarkRow: { name: string; value: number } | null = null;
                for (const item of payload) {
                  const value = Number(item.value ?? 0);
                  if (item.dataKey === "benchmark") {
                    if (Number.isFinite(value)) {
                      benchmarkRow = { name: String(item.name), value };
                    }
                    continue;
                  }
                  total += value;
                  rows.push({
                    name: String(item.name),
                    value,
                    color:
                      typeof item.color === "string"
                        ? item.color
                        : "var(--foreground)",
                  });
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
                    {rows.map((row) => (
                      <p
                        key={row.name}
                        style={{
                          color: "var(--foreground)",
                          margin: "2px 0",
                        }}
                      >
                        <span style={{ color: row.color }}>● </span>
                        {row.name}: {tooltipFormatter.format(row.value)}
                      </p>
                    ))}
                    {rows.length > 0 ? (
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
                    ) : null}
                    {benchmarkRow ? (
                      <p
                        style={{
                          color: "var(--muted)",
                          marginTop: 4,
                        }}
                      >
                        {benchmarkRow.name}:{" "}
                        {tooltipFormatter.format(benchmarkRow.value)}
                      </p>
                    ) : null}
                  </div>
                );
              }}
            />
            {areas.map((s, idx) => {
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
                  strokeWidth={s.variant === "cash" ? 1.25 : 1.5}
                  strokeDasharray={s.variant === "cash" ? "3 2" : undefined}
                  fill={color}
                  fillOpacity={
                    s.variant === "cash"
                      ? 0.18
                      : s.variant === "equities"
                        ? 0.45
                        : 0.35
                  }
                />
              );
            })}
            {benchmark ? (
              <Line
                type="monotone"
                dataKey={benchmark.key}
                name={benchmark.label}
                hide={hidden.has(benchmark.key)}
                stroke={BENCHMARK_COLOR}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                connectNulls
              />
            ) : null}
          </ComposedChart>
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
                style={
                  s.variant === "benchmark"
                    ? {
                        display: "inline-block",
                        width: 14,
                        borderTop: `2px dashed ${color}`,
                      }
                    : {
                        display: "inline-block",
                        width: 12,
                        height: 12,
                        background: color,
                        opacity: s.variant === "cash" ? 0.5 : 1,
                      }
                }
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

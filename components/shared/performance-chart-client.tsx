"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { groupColor } from "@/lib/chart-colors";

const BENCHMARK_COLOR = "var(--subtle)";

type SeriesLine = {
  key: string;
  label: string;
  kind: "entity" | "benchmark";
};

type Point = Record<string, string | number | null>;

type Props = {
  lines: SeriesLine[];
  points: Point[];
};

function formatPct(value: number, decimals: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

export function PerformanceChartClient({ lines, points }: Props) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  if (points.length < 2 || lines.length === 0) {
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

  const colorByKey = new Map<string, string>();
  let entityIdx = 0;
  for (const l of lines) {
    if (l.kind === "benchmark") {
      colorByKey.set(l.key, BENCHMARK_COLOR);
    } else {
      colorByKey.set(l.key, groupColor(entityIdx));
      entityIdx += 1;
    }
  }
  const colorOf = (key: string) => colorByKey.get(key) ?? "var(--foreground)";

  return (
    <div className="flex flex-col gap-3">
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
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
              width={52}
              tickFormatter={(value: number) => formatPct(value, 0)}
            />
            <ReferenceLine y={0} stroke="var(--border)" />
            <Tooltip
              content={({ active, payload, label: dateLabel }) => {
                if (!active || !payload?.length) return null;
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
                      {new Date(String(dateLabel)).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                    {payload.map((item) => {
                      if (item.value == null) return null;
                      return (
                        <p
                          key={String(item.dataKey)}
                          style={{
                            color: "var(--foreground)",
                            margin: "2px 0",
                          }}
                        >
                          <span
                            style={{ color: colorOf(String(item.dataKey)) }}
                          >
                            ●{" "}
                          </span>
                          {item.name}: {formatPct(Number(item.value), 2)}
                        </p>
                      );
                    })}
                  </div>
                );
              }}
            />
            {lines.map((l) => {
              const color = colorOf(l.key);
              return (
                <Line
                  key={l.key}
                  type="monotone"
                  dataKey={l.key}
                  name={l.label}
                  hide={hidden.has(l.key)}
                  stroke={color}
                  strokeWidth={l.kind === "benchmark" ? 1.75 : 2}
                  strokeDasharray={l.kind === "benchmark" ? "5 4" : undefined}
                  dot={false}
                  connectNulls={l.kind === "benchmark"}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {lines.map((l) => {
          const color = colorOf(l.key);
          const off = hidden.has(l.key);
          return (
            <button
              key={l.key}
              type="button"
              onClick={() => toggle(l.key)}
              className="flex items-center gap-1.5 text-xs"
              style={{ opacity: off ? 0.4 : 1 }}
            >
              <span
                aria-hidden
                className="inline-block w-3.5 shrink-0"
                style={
                  l.kind === "benchmark"
                    ? { borderTop: `2px dashed ${color}` }
                    : { height: 12, background: color }
                }
              />
              <span
                style={{
                  color: "var(--muted)",
                  textDecoration: off ? "line-through" : undefined,
                }}
              >
                {l.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

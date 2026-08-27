"use client";

import { useMemo, useState } from "react";
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

const RANGE_OPTIONS = [
  { key: "all", label: "All" },
  { key: "3m", label: "3M" },
  { key: "ytd", label: "YTD" },
  { key: "1y", label: "1Y" },
] as const;

type RangeKey = (typeof RANGE_OPTIONS)[number]["key"];

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

function rangeStart(range: RangeKey, latest: Date): Date | null {
  if (range === "all") return null;

  const start = new Date(latest);
  start.setUTCHours(0, 0, 0, 0);

  if (range === "3m") {
    start.setUTCMonth(start.getUTCMonth() - 3);
    return start;
  }

  if (range === "1y") {
    start.setUTCFullYear(start.getUTCFullYear() - 1);
    return start;
  }

  return new Date(Date.UTC(latest.getUTCFullYear(), 0, 1));
}

function rawPointsForRange(points: Point[], range: RangeKey): Point[] {
  const latestDate = points.at(-1)?.date;
  if (typeof latestDate !== "string") return points;

  const start = rangeStart(range, new Date(latestDate));
  if (!start) return points;

  return points.filter((point) => {
    if (typeof point.date !== "string") return false;
    return new Date(point.date).getTime() >= start.getTime();
  });
}

function filteredPointsForRange(points: Point[], range: RangeKey): Point[] {
  const filtered = rawPointsForRange(points, range);
  return filtered.length >= 2 ? filtered : points;
}

function rebasePoints(points: Point[], lines: SeriesLine[]): Point[] {
  const anchors = new Map<string, number>();

  for (const line of lines) {
    for (const point of points) {
      const value = point[line.key];
      if (typeof value === "number" && Number.isFinite(value)) {
        anchors.set(line.key, value);
        break;
      }
    }
  }

  return points.map((point) => {
    const next: Point = { date: point.date };
    for (const line of lines) {
      const value = point[line.key];
      const anchor = anchors.get(line.key);
      next[line.key] =
        typeof value === "number" &&
        Number.isFinite(value) &&
        anchor !== undefined
          ? Number(
              (((1 + value / 100) / (1 + anchor / 100) - 1) * 100).toFixed(4),
            )
          : null;
    }
    return next;
  });
}

export function PerformanceChartClient({ lines, points }: Props) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [range, setRange] = useState<RangeKey>("all");
  const rangeCounts = useMemo(
    () =>
      new Map(
        RANGE_OPTIONS.map((option) => [
          option.key,
          rawPointsForRange(points, option.key).length,
        ]),
      ),
    [points],
  );
  const visiblePoints = useMemo(
    () => rebasePoints(filteredPointsForRange(points, range), lines),
    [lines, points, range],
  );

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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="label">Range</span>
        <div className="flex min-h-8 flex-wrap items-center gap-1 border border-border bg-surface-elevated p-0.5">
          {RANGE_OPTIONS.map((option) => {
            const selected = option.key === range;
            const disabled = (rangeCounts.get(option.key) ?? 0) < 2;
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={selected}
                disabled={disabled}
                onClick={() => setRange(option.key)}
                className="h-6 px-2 text-[11px] font-medium text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35 aria-pressed:bg-accent aria-pressed:text-accent-foreground"
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={visiblePoints}
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

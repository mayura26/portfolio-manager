"use client";

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

const PORTFOLIO_COLOR = "var(--accent)";
const BENCHMARK_COLOR = "var(--subtle)";

type PerformancePoint = {
  date: string;
  portfolio: number;
  benchmark: number | null;
};

type Props = {
  label: string;
  benchmarkLabel: string;
  points: PerformancePoint[];
};

function formatPct(value: number, decimals: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

export function PerformanceChartClient({
  label,
  benchmarkLabel,
  points,
}: Props) {
  if (points.length < 2) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-muted">
        Not enough history yet
      </div>
    );
  }

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
                const pItem = payload.find((i) => i.dataKey === "portfolio");
                const bItem = payload.find((i) => i.dataKey === "benchmark");
                const pVal =
                  pItem && pItem.value != null ? Number(pItem.value) : null;
                const bVal =
                  bItem && bItem.value != null ? Number(bItem.value) : null;
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
                    {pVal != null ? (
                      <p
                        style={{ color: "var(--foreground)", margin: "2px 0" }}
                      >
                        <span style={{ color: PORTFOLIO_COLOR }}>● </span>
                        {label}: {formatPct(pVal, 2)}
                      </p>
                    ) : null}
                    {bVal != null ? (
                      <p
                        style={{ color: "var(--foreground)", margin: "2px 0" }}
                      >
                        <span style={{ color: BENCHMARK_COLOR }}>● </span>
                        {benchmarkLabel}: {formatPct(bVal, 2)}
                      </p>
                    ) : null}
                    {pVal != null && bVal != null ? (
                      <p
                        style={{
                          color: "var(--muted)",
                          marginTop: 6,
                          borderTop: "1px solid var(--border)",
                          paddingTop: 6,
                        }}
                      >
                        vs {benchmarkLabel}: {formatPct(pVal - bVal, 2)}
                      </p>
                    ) : null}
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="portfolio"
              name={label}
              stroke={PORTFOLIO_COLOR}
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="benchmark"
              name={benchmarkLabel}
              stroke={BENCHMARK_COLOR}
              strokeWidth={1.75}
              strokeDasharray="5 4"
              dot={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5"
            style={{ background: PORTFOLIO_COLOR }}
          />
          {label}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block w-3.5"
            style={{ borderTop: `2px dashed ${BENCHMARK_COLOR}` }}
          />
          {benchmarkLabel}
        </span>
      </div>
    </div>
  );
}

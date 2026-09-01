"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type ValueChartPoint = {
  date: string;
  equities: number;
  cash: number;
  costBasis?: number;
};

type Props = {
  points: ValueChartPoint[];
  baseCurrency: string;
  /** When false, only equities are drawn (cash values ignored). */
  stackedCash?: boolean;
  /** Second series: FIFO cost of open lots (portfolio charts). */
  showCostBasis?: boolean;
  /** Label for the equities / market value series (default: "Equities"). */
  equitiesLabel?: string;
};

export function ValueChartClient({
  points,
  baseCurrency,
  stackedCash = true,
  showCostBasis = false,
  equitiesLabel = "Equities",
}: Props) {
  if (points.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-muted">
        Not enough history yet
      </div>
    );
  }

  const showCash = stackedCash && points.some((p) => Math.abs(p.cash) > 0.005);
  const hasCost =
    showCostBasis &&
    points.some((p) => p.costBasis !== undefined && !Number.isNaN(p.costBasis));

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
        <ComposedChart
          data={points}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id="equitiesArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="cashArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--info)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--info)" stopOpacity={0} />
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
            tickFormatter={(value: string) => {
              const d = new Date(value);
              return d.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              });
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
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const get = (key: string) =>
                Number(payload.find((x) => x.dataKey === key)?.value ?? 0);
              const equities = get("equities");
              const cash = showCash ? get("cash") : 0;
              const costBasis = hasCost ? get("costBasis") : 0;
              const total = equities + cash;
              const unrealized =
                hasCost && !showCash ? equities - costBasis : null;

              const labelFor = (key: string) => {
                if (key === "equities") return equitiesLabel;
                if (key === "cash") return "Cash-like";
                if (key === "costBasis") return "Cost basis";
                return String(key);
              };

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
                      {labelFor(String(item.dataKey))}:{" "}
                      {tooltipFormatter.format(Number(item.value))}
                    </p>
                  ))}
                  {showCash ? (
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
                  {unrealized !== null && Number.isFinite(unrealized) ? (
                    <p
                      style={{
                        color: "var(--foreground)",
                        marginTop: 6,
                        borderTop: "1px solid var(--border)",
                        paddingTop: 6,
                      }}
                    >
                      Unrealized: {tooltipFormatter.format(unrealized)}
                    </p>
                  ) : null}
                </div>
              );
            }}
          />
          {hasCost || showCash ? (
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          ) : null}
          {showCash ? (
            <>
              <Area
                type="monotone"
                dataKey="equities"
                name={equitiesLabel}
                stackId="stack"
                stroke="var(--accent)"
                strokeWidth={2}
                fill="url(#equitiesArea)"
              />
              <Area
                type="monotone"
                dataKey="cash"
                name="Cash-like"
                stackId="stack"
                stroke="var(--info)"
                strokeWidth={2}
                fill="url(#cashArea)"
              />
            </>
          ) : (
            <Area
              type="monotone"
              dataKey="equities"
              name={equitiesLabel}
              stroke="var(--accent)"
              strokeWidth={2}
              fill="url(#equitiesArea)"
            />
          )}
          {hasCost ? (
            <Line
              type="monotone"
              dataKey="costBasis"
              name="Cost basis"
              stroke="var(--muted)"
              strokeWidth={2}
              strokeDasharray="4 3"
              dot={false}
              connectNulls
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

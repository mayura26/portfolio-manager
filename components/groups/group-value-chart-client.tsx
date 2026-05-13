"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PALETTE = [
  "#c9512e",
  "#4a6b8a",
  "#2f6f4a",
  "#b88a3e",
  "#6b6358",
  "#a8442c",
  "#8a8378",
  "#3a4a5a",
];

export type GroupValueChartSeries = { key: string; label: string };

type Point = Record<string, string | number>;

type Props = {
  baseCurrency: string;
  series: GroupValueChartSeries[];
  points: Point[];
};

export function GroupValueChartClient({ baseCurrency, series, points }: Props) {
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
                      {item.name}: {tooltipFormatter.format(Number(item.value))}
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
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            formatter={(value) => value}
          />
          {series.map((s, idx) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stackId="group"
              stroke={PALETTE[idx % PALETTE.length]}
              fill={PALETTE[idx % PALETTE.length]}
              fillOpacity={0.35}
              strokeWidth={1.5}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SectorBreakdown } from "@/lib/congress-trades";
import { formatCurrency } from "@/lib/format";

type Props = {
  data: SectorBreakdown[];
};

export function CongressSectorChartClient({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted">
        No sector data — sync trades to populate
      </div>
    );
  }

  const chartData = data.slice(0, 12).map((d) => ({
    sector: d.sector.length > 16 ? d.sector.slice(0, 14) + "…" : d.sector,
    fullSector: d.sector,
    Buys: d.buyCount,
    Sells: d.sellCount,
    buyVolume: d.buyVolume,
    sellVolume: d.sellVolume,
  }));

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="sector"
            tick={{ fontSize: 11, fill: "var(--muted)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted)" }}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 0,
              fontSize: 12,
            }}
            labelFormatter={(_, payload) =>
              payload?.[0]?.payload?.fullSector ?? ""
            }
            labelStyle={{ color: "var(--muted)" }}
            itemStyle={{ color: "var(--foreground)" }}
            formatter={(value, name, item) => {
              const datum = item?.payload as
                | { buyVolume?: number; sellVolume?: number }
                | undefined;
              const volume =
                name === "Buys" ? datum?.buyVolume : datum?.sellVolume;
              const suffix =
                volume && volume > 0
                  ? ` · ${formatCurrency(volume, "USD", { compact: true })}`
                  : "";
              return [`${value}${suffix}`, name];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, color: "var(--muted)" }}
            iconSize={8}
          />
          <Bar dataKey="Buys" fill="var(--gain)" radius={[2, 2, 0, 0]} />
          <Bar dataKey="Sells" fill="var(--loss)" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

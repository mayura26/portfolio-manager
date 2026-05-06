"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

type Slice = {
  key: string;
  label: string;
  value: number;
  percent: number;
};

type Props = {
  slices: Slice[];
  baseCurrency: string;
  percentOnly?: boolean;
};

const PALETTE = [
  "#c9512e", // accent terracotta
  "#4a6b8a", // info blue
  "#2f6f4a", // gain forest
  "#b88a3e", // warning ochre
  "#6b6358", // neutral
  "#a8442c", // loss brick
  "#8a8378", // muted
  "#3a4a5a",
];

export function AllocationChartClient({
  slices,
  baseCurrency,
  percentOnly = false,
}: Props) {
  if (slices.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-muted">
        No allocation data
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_minmax(0,260px)]">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius="55%"
              outerRadius="85%"
              paddingAngle={1}
              stroke="var(--background)"
              strokeWidth={1}
            >
              {slices.map((slice, idx) => (
                <Cell key={slice.key} fill={PALETTE[idx % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, _name, item) => {
                const numeric =
                  typeof value === "number" ? value : Number(value);
                const pct = item?.payload?.percent;
                const formatted = percentOnly
                  ? `${numeric.toFixed(1)}%`
                  : new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: baseCurrency,
                    }).format(numeric) + (pct ? ` (${pct.toFixed(1)}%)` : "");
                return [formatted, item?.payload?.label];
              }}
              contentStyle={{
                background: "var(--surface-elevated)",
                border: "1px solid var(--border)",
                borderRadius: 0,
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--muted)" }}
              itemStyle={{ color: "var(--foreground)" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="flex flex-col gap-2 self-center text-sm">
        {slices.map((s, idx) => (
          <li key={s.key} className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0"
                style={{ background: PALETTE[idx % PALETTE.length] }}
                aria-hidden
              />
              <span className="truncate text-foreground">{s.label}</span>
            </div>
            <span className="tabular shrink-0 text-muted">
              {s.percent.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

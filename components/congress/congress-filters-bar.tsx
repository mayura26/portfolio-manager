"use client";

import { usePathname, useRouter } from "next/navigation";
import type { CongressFilters } from "@/lib/validators";

type Props = {
  filters: CongressFilters;
  sectors: string[];
};

// Thresholds compared against amountMid (band midpoint). Each value sits just
// below the corresponding STOCK Act band's midpoint, so the label cleanly
// includes that band and everything larger.
const SIZE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Any size" },
  { value: "15000", label: "≥ $15K" },
  { value: "50000", label: "≥ $50K" },
  { value: "100000", label: "≥ $100K" },
  { value: "250000", label: "≥ $250K" },
  { value: "1000000", label: "≥ $1M" },
  { value: "5000000", label: "≥ $5M" },
];

export function CongressFiltersBar({ filters, sectors }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams({
      days: String(filters.days),
      ...(filters.sector ? { sector: filters.sector } : {}),
      ...(filters.ticker ? { ticker: filters.ticker } : {}),
      ...(filters.transaction ? { transaction: filters.transaction } : {}),
      ...(filters.minAmount ? { minAmount: String(filters.minAmount) } : {}),
    });

    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }

    // Reset to page 1 on filter change
    params.delete("page");

    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="hairline bg-surface flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="flex items-center gap-2">
        <label htmlFor="congress-period" className="label text-xs">
          Period
        </label>
        <select
          id="congress-period"
          value={String(filters.days)}
          onChange={(e) => updateParam("days", e.target.value)}
          className="hairline bg-transparent px-2 py-1 text-sm text-foreground"
        >
          <option value="30">30 days</option>
          <option value="60">60 days</option>
          <option value="90">90 days</option>
          <option value="180">180 days</option>
          <option value="365">1 year</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="congress-type" className="label text-xs">
          Type
        </label>
        <select
          id="congress-type"
          value={filters.transaction ?? ""}
          onChange={(e) => updateParam("transaction", e.target.value)}
          className="hairline bg-transparent px-2 py-1 text-sm text-foreground"
        >
          <option value="">All</option>
          <option value="Purchase">Buys</option>
          <option value="Sale">Sells</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="congress-min-size" className="label text-xs">
          Min size
        </label>
        <select
          id="congress-min-size"
          value={filters.minAmount ? String(filters.minAmount) : ""}
          onChange={(e) => updateParam("minAmount", e.target.value)}
          className="hairline bg-transparent px-2 py-1 text-sm text-foreground"
        >
          {SIZE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {sectors.length > 0 && (
        <div className="flex items-center gap-2">
          <label htmlFor="congress-sector" className="label text-xs">
            Sector
          </label>
          <select
            id="congress-sector"
            value={filters.sector ?? ""}
            onChange={(e) => updateParam("sector", e.target.value)}
            className="hairline bg-transparent px-2 py-1 text-sm text-foreground"
          >
            <option value="">All sectors</option>
            {sectors.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

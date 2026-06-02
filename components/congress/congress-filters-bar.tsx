"use client";

import { useRouter, usePathname } from "next/navigation";
import type { CongressFilters } from "@/lib/validators";

type Props = {
  filters: CongressFilters;
  sectors: string[];
};

export function CongressFiltersBar({ filters, sectors }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams({
      days: String(filters.days),
      ...(filters.sector ? { sector: filters.sector } : {}),
      ...(filters.ticker ? { ticker: filters.ticker } : {}),
      ...(filters.transaction ? { transaction: filters.transaction } : {}),
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
        <label className="label text-xs">Period</label>
        <select
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
        <label className="label text-xs">Type</label>
        <select
          value={filters.transaction ?? ""}
          onChange={(e) => updateParam("transaction", e.target.value)}
          className="hairline bg-transparent px-2 py-1 text-sm text-foreground"
        >
          <option value="">All</option>
          <option value="Purchase">Buys</option>
          <option value="Sale">Sells</option>
        </select>
      </div>

      {sectors.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="label text-xs">Sector</label>
          <select
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

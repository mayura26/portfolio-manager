"use client";

import { usePathname, useRouter } from "next/navigation";
import type { InsiderFilters } from "@/lib/validators";

type Props = {
  filters: InsiderFilters;
};

export function InsiderFiltersBar({ filters }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams({
      days: String(filters.days),
      ...(filters.ticker ? { ticker: filters.ticker } : {}),
      ...(filters.transaction ? { transaction: filters.transaction } : {}),
    });

    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");

    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="hairline bg-surface flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="flex items-center gap-2">
        <label htmlFor="insider-period" className="label text-xs">
          Period
        </label>
        <select
          id="insider-period"
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
        <label htmlFor="insider-type" className="label text-xs">
          Type
        </label>
        <select
          id="insider-type"
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
        <label htmlFor="insider-ticker" className="label text-xs">
          Ticker
        </label>
        <input
          id="insider-ticker"
          defaultValue={filters.ticker ?? ""}
          placeholder="e.g. AAPL"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              updateParam("ticker", e.currentTarget.value.trim().toUpperCase());
            }
          }}
          className="hairline w-28 bg-transparent px-2 py-1 text-sm text-foreground"
        />
      </div>
    </div>
  );
}

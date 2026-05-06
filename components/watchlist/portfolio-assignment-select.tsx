"use client";

import { useTransition } from "react";
import { assignWatchlistToPortfolio } from "@/actions/watchlist";

type Props = {
  itemId: string;
  currentPortfolioId: string | null;
  portfolios: { id: string; name: string }[];
};

export function PortfolioAssignmentSelect({
  itemId,
  currentPortfolioId,
  portfolios,
}: Props) {
  const [pending, start] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <label className="label" htmlFor={`pf-${itemId}`}>
        Portfolio
      </label>
      <select
        id={`pf-${itemId}`}
        defaultValue={currentPortfolioId ?? ""}
        disabled={pending}
        onChange={(e) => {
          const value = e.target.value || null;
          start(() => {
            void assignWatchlistToPortfolio(itemId, value);
          });
        }}
        className="hairline bg-surface px-2 py-1 text-xs text-foreground disabled:opacity-50"
      >
        <option value="">Unassigned</option>
        {portfolios.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}

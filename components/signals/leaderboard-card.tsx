"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import type { CrossSourceTicker, SmartMoneyTrade } from "@/lib/trade-signals";

type Props = {
  row: CrossSourceTicker;
  trades: SmartMoneyTrade[];
};

function sourceCount(row: CrossSourceTicker, source: string): number {
  const t =
    source === "House"
      ? row.house
      : source === "Senate"
        ? row.senate
        : row.insider;
  return t.buy + t.sell;
}

function isBuy(tx: string) {
  return tx === "Purchase";
}
function isSell(tx: string) {
  return tx === "Sale" || tx === "Sale (Partial)";
}

function tradeAmount(t: SmartMoneyTrade): string {
  if (t.rangeRaw) return t.rangeRaw;
  if (t.value != null) return formatCurrency(t.value, "USD", { compact: true });
  if (t.shares != null) return `${formatNumber(t.shares, { decimals: 0 })} sh`;
  return "—";
}

export function LeaderboardCard({ row, trades }: Props) {
  const [open, setOpen] = useState(false);
  const net =
    row.netVolume > 0
      ? { label: "BUY", tone: "text-gain" }
      : row.netVolume < 0
        ? { label: "SELL", tone: "text-loss" }
        : { label: "MIXED", tone: "text-muted" };

  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-surface-elevated"
      >
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-subtle transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={1.5}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <span className="font-medium text-accent">{row.ticker}</span>
          {row.sector ? (
            <span className="ml-2 text-xs text-muted">{row.sector}</span>
          ) : null}
        </div>
        <div className="hidden flex-wrap items-center gap-1.5 sm:flex">
          {row.sources.map((s) => (
            <span
              key={s}
              className="hairline label inline-flex items-center gap-1 bg-surface-elevated px-1.5 py-0.5 text-foreground"
            >
              {s}
              <span className="tabular text-subtle">{sourceCount(row, s)}</span>
            </span>
          ))}
        </div>
        <span className={`label w-12 text-right ${net.tone}`}>{net.label}</span>
        <span className="tabular w-16 text-right text-xs text-muted">
          {row.totalVolume > 0
            ? formatCurrency(row.totalVolume, "USD", { compact: true })
            : "—"}
        </span>
      </button>

      {open ? (
        <div className="bg-surface-elevated px-5 pb-4 pt-1">
          {trades.length === 0 ? (
            <p className="py-2 text-xs text-muted">
              No itemized trades in range.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {trades.map((t, i) => {
                const tone = isBuy(t.transaction)
                  ? "text-gain"
                  : isSell(t.transaction)
                    ? "text-loss"
                    : "text-muted";
                return (
                  <li
                    key={`${t.source}-${t.actor}-${i}`}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="label hairline bg-surface px-1.5 py-0.5 text-subtle">
                        {t.source}
                      </span>
                      <span className="truncate text-foreground">
                        {t.actor}
                      </span>
                      {t.detail ? (
                        <span className="hidden text-xs text-subtle md:inline">
                          {t.detail}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className={`text-xs ${tone}`}>{t.transaction}</span>
                      <span className="tabular text-xs text-muted">
                        {tradeAmount(t)}
                      </span>
                      <span className="tabular w-16 text-right text-xs text-subtle">
                        {formatDate(t.transactionDate)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <Link
            href={`/stocks/${row.ticker}`}
            className="mt-3 inline-block text-xs text-accent hover:underline"
          >
            Open {row.ticker} stock page →
          </Link>
        </div>
      ) : null}
    </div>
  );
}

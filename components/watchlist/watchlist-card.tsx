import Link from "next/link";
import type {
  Alert,
  Instrument,
  WatchlistItem,
} from "@/app/generated/prisma/client";
import {
  formatCurrency,
  formatPercent,
  formatRelative,
  pnlClass,
} from "@/lib/format";
import type { WatchlistAiAnalysis } from "@/lib/watchlist-ai";
import type { QuoteSnapshot } from "@/lib/yahoo";
import { BuyRangeForm } from "./buy-range-form";
import { PortfolioAssignmentSelect } from "./portfolio-assignment-select";
import { WatchlistActions } from "./watchlist-actions";
import { WatchlistStatusBadge } from "./watchlist-status-badge";

type WatchlistItemRow = WatchlistItem & {
  instrument: Instrument;
  alert: Alert | null;
};

type Props = {
  item: WatchlistItemRow;
  quote: QuoteSnapshot | null;
  portfolios: { id: string; name: string }[];
};

export function WatchlistCard({ item, quote, portfolios }: Props) {
  const { instrument, alert } = item;
  const currency = instrument.currency;

  const currentPrice = quote?.price ?? null;
  const changePercent = quote?.changePercent ?? null;

  const buyLow = item.buyRangeLow ? Number(item.buyRangeLow) : null;
  const buyHigh = item.buyRangeHigh ? Number(item.buyRangeHigh) : null;

  let zoneStatus: "in-zone" | "above-zone" | "below-zone" | null = null;
  let zoneDistance: number | null = null;

  if (currentPrice !== null && buyHigh !== null) {
    if (buyLow !== null && currentPrice < buyLow) {
      zoneStatus = "below-zone";
      zoneDistance = ((buyLow - currentPrice) / buyLow) * 100;
    } else if (currentPrice <= buyHigh) {
      zoneStatus = "in-zone";
    } else {
      zoneStatus = "above-zone";
      zoneDistance = ((currentPrice - buyHigh) / buyHigh) * 100;
    }
  }

  const aiAnalysis = item.aiAnalysis as WatchlistAiAnalysis | null;
  const alertTriggered = alert?.status === "TRIGGERED";

  return (
    <article className="hairline flex flex-col gap-3 bg-surface-elevated p-4">
      {alertTriggered ? (
        <div className="hairline border-gain/40 bg-gain/10 px-3 py-2 text-xs text-gain">
          Price entered your buy zone
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <WatchlistStatusBadge status={item.status} />
          </div>
          <h3 className="mt-2 text-base text-foreground">
            <Link
              href={`/stocks/${encodeURIComponent(instrument.yahooSymbol)}`}
              className="hover:text-accent"
            >
              <span className="tabular font-medium">{instrument.symbol}</span>{" "}
              <span className="text-muted">{instrument.name}</span>
            </Link>
          </h3>

          {currentPrice !== null ? (
            <div className="mt-1 flex items-baseline gap-2">
              <span className="tabular text-sm text-foreground">
                {formatCurrency(currentPrice, currency)}
              </span>
              {changePercent !== null ? (
                <span className={`text-xs ${pnlClass(changePercent)}`}>
                  {formatPercent(changePercent / 100, { signed: true })}
                </span>
              ) : (
                <span className="text-xs text-subtle">price unavailable</span>
              )}
            </div>
          ) : (
            <p className="mt-1 text-sm text-subtle">Price unavailable</p>
          )}
        </div>

        <WatchlistActions itemId={item.id} status={item.status} />
      </div>

      {buyHigh !== null ? (
        <div className="hairline border-border bg-surface px-3 py-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="label">Buy zone</span>
            <span className="tabular text-muted">
              {buyLow !== null
                ? `${formatCurrency(buyLow, currency)} – `
                : "up to "}
              {formatCurrency(buyHigh, currency)}
            </span>
          </div>
          {zoneStatus && currentPrice !== null ? (
            <p
              className={`mt-1 text-xs ${
                zoneStatus === "in-zone"
                  ? "text-gain"
                  : zoneStatus === "below-zone"
                    ? "text-loss"
                    : "text-muted"
              }`}
            >
              {zoneStatus === "in-zone"
                ? "Currently in buy zone"
                : zoneStatus === "above-zone" && zoneDistance !== null
                  ? `${formatPercent(zoneDistance / 100)} above zone`
                  : zoneDistance !== null
                    ? `${formatPercent(zoneDistance / 100)} below zone`
                    : null}
            </p>
          ) : null}
        </div>
      ) : null}

      {item.status === "WATCHING" ? (
        <div className="flex flex-col gap-1">
          <p className="label text-xs text-subtle">
            {buyHigh !== null ? "Update buy range" : "Set buy range"}
          </p>
          <BuyRangeForm
            itemId={item.id}
            currentLow={item.buyRangeLow?.toString() ?? null}
            currentHigh={item.buyRangeHigh?.toString() ?? null}
          />
        </div>
      ) : null}

      {aiAnalysis ? (
        <details className="text-sm">
          <summary className="label cursor-pointer select-none text-xs text-muted hover:text-foreground">
            AI analysis
          </summary>
          <div className="mt-2 flex flex-col gap-1 text-xs text-muted">
            {aiAnalysis.suggestedLow && aiAnalysis.suggestedHigh ? (
              <p className="tabular">
                Suggested zone:{" "}
                <span className="text-foreground">
                  {formatCurrency(aiAnalysis.suggestedLow, currency)} –{" "}
                  {formatCurrency(aiAnalysis.suggestedHigh, currency)}
                </span>
              </p>
            ) : null}
            <p className="mt-1 italic">{aiAnalysis.rationale}</p>
          </div>
        </details>
      ) : null}

      {item.notes ? (
        <p className="text-xs italic text-subtle">"{item.notes}"</p>
      ) : null}

      {item.status === "WATCHING" ? (
        <PortfolioAssignmentSelect
          itemId={item.id}
          currentPortfolioId={item.portfolioId}
          portfolios={portfolios}
        />
      ) : null}

      <div className="border-t border-border pt-2 text-xs text-muted">
        Added {formatRelative(item.createdAt)}
      </div>
    </article>
  );
}

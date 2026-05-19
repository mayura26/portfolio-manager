import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { aggregateOpenPositions } from "@/lib/signals";
import { fetchNews } from "@/lib/yahoo";
import { generateDailySummary } from "@/lib/autowatcher-ai";

export type AutoWatcherItemResult = {
  instrumentId: string;
  symbol: string;
  pnlAlertFired: boolean;
  dailySummaryFired: boolean;
  error?: string;
};

export type AutoWatcherRunResult = {
  processed: number;
  pnlFired: number;
  dailyFired: number;
  skipped: number;
  failures: AutoWatcherItemResult[];
};

function isSameDayUtc(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function formatMoney(value: Decimal, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    value.toNumber(),
  );
}

export async function runAutoWatcher(): Promise<AutoWatcherRunResult> {
  const instruments = await db.instrument.findMany({
    where: { autoWatcherEnabled: true },
    select: {
      id: true,
      symbol: true,
      yahooSymbol: true,
      currency: true,
      autoWatcherThreshold: true,
      autoWatcherLastBand: true,
      autoWatcherLastDailyAt: true,
    },
  });

  if (instruments.length === 0) {
    return { processed: 0, pnlFired: 0, dailyFired: 0, skipped: 0, failures: [] };
  }

  // Aggregate open positions across all portfolios once
  const allPositions = await aggregateOpenPositions();
  const positionMap = new Map(allPositions.map((p) => [p.instrumentId, p]));

  let pnlFired = 0;
  let dailyFired = 0;
  let skipped = 0;
  const failures: AutoWatcherItemResult[] = [];

  for (const inst of instruments) {
    const result: AutoWatcherItemResult = {
      instrumentId: inst.id,
      symbol: inst.symbol,
      pnlAlertFired: false,
      dailySummaryFired: false,
    };

    try {
      const position = positionMap.get(inst.id);
      if (!position || !position.quantity || position.quantity.lte(0)) {
        skipped++;
        continue;
      }

      const threshold = new Decimal(inst.autoWatcherThreshold.toString());

      // ── P&L milestone check ─────────────────────────────────────────
      const pnlPct = position.unrealizedPnLPercent;
      if (pnlPct && !threshold.isZero()) {
        const currentBand = Math.trunc(pnlPct.dividedBy(threshold).toNumber());

        if (inst.autoWatcherLastBand === null) {
          // First evaluation: just record the band, no alert
          await db.instrument.update({
            where: { id: inst.id },
            data: { autoWatcherLastBand: currentBand },
          });
        } else if (currentBand !== inst.autoWatcherLastBand) {
          const prevBand = inst.autoWatcherLastBand;
          const milestoneLabel =
            currentBand >= 0 ? `+${currentBand * 10}%` : `${currentBand * 10}%`;
          const avgCost = position.costBase.dividedBy(position.quantity);

          await createNotification({
            type: "AUTO_WATCHER",
            title: `${inst.symbol} crossed ${milestoneLabel} milestone`,
            message: `${inst.symbol} is now ${pnlPct.toFixed(1)}% vs cost basis (prev: ${prevBand * Number(threshold)}%). Avg cost ${formatMoney(avgCost, inst.currency)}, current ${position.marketPrice ? formatMoney(position.marketPrice, inst.currency) : "N/A"}.`,
            metadata: {
              kind: "milestone",
              currentBand,
              prevBand,
              pnlPct: pnlPct.toNumber(),
              threshold: threshold.toNumber(),
            },
          });

          await db.instrument.update({
            where: { id: inst.id },
            data: { autoWatcherLastBand: currentBand },
          });

          result.pnlAlertFired = true;
          pnlFired++;
        }
      }

      // ── Daily AI summary check ──────────────────────────────────────
      const now = new Date();
      if (inst.autoWatcherLastDailyAt && isSameDayUtc(inst.autoWatcherLastDailyAt, now)) {
        // Already ran today
      } else {
        const recentPrices = await db.priceHistory.findMany({
          where: { instrumentId: inst.id },
          orderBy: { date: "desc" },
          take: 3,
          select: { date: true, close: true },
        });

        if (recentPrices.length >= 2) {
          const latestClose = new Decimal(recentPrices[0].close.toString());
          const prevClose = new Decimal(recentPrices[1].close.toString());
          const dayChangePct = !prevClose.isZero()
            ? latestClose.minus(prevClose).dividedBy(prevClose).times(100).toNumber()
            : 0;

          const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          let recentHeadlines: string[] = [];

          try {
            const newsItems = await fetchNews(inst.yahooSymbol, 8);
            recentHeadlines = newsItems
              .filter((n) => n.publishedAt >= cutoff)
              .map((n) => n.title)
              .slice(0, 5);
          } catch {
            // News fetch failure shouldn't block the rest
          }

          const shouldFire = Math.abs(dayChangePct) >= 1.5 || recentHeadlines.length > 0;

          if (shouldFire) {
            const weekPrices = recentPrices[2]
              ? new Decimal(recentPrices[2].close.toString())
              : null;
            const weekChangePct =
              weekPrices && !weekPrices.isZero()
                ? latestClose.minus(weekPrices).dividedBy(weekPrices).times(100).toNumber()
                : null;

            const avgCostBase = position.costBase.dividedBy(position.quantity).toNumber();

            const summary = await generateDailySummary({
              symbol: inst.symbol,
              name: inst.symbol,
              currency: inst.currency,
              currentPrice: latestClose.toNumber(),
              dayChangePct,
              weekChangePct,
              avgCostBase,
              unrealizedPnLPct: position.unrealizedPnLPercent?.toNumber() ?? null,
              newsHeadlines: recentHeadlines,
            });

            await createNotification({
              type: "AUTO_WATCHER",
              title: `${inst.symbol}: ${summary.headline}`,
              message: summary.summary,
              metadata: {
                kind: "daily",
                sentiment: summary.sentiment,
                dayChangePct,
                generatedAt: summary.generatedAt,
              },
            });

            result.dailySummaryFired = true;
            dailyFired++;
          }
        }

        await db.instrument.update({
          where: { id: inst.id },
          data: { autoWatcherLastDailyAt: now },
        });
      }
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      failures.push(result);
      continue;
    }

    if (!result.error) {
      // Only push non-failure results that actually did something
      if (result.pnlAlertFired || result.dailySummaryFired) {
        // Already counted above
      }
    }
  }

  return {
    processed: instruments.length - skipped,
    pnlFired,
    dailyFired,
    skipped,
    failures,
  };
}

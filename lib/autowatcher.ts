import Decimal from "decimal.js";
import { generateDailySummary } from "@/lib/autowatcher-ai";
import { formatAutoWatcherMilestoneMessage } from "@/lib/autowatcher-format";
import { db } from "@/lib/db";
import type { NotificationBatchCandidate } from "@/lib/notification-batching";
import { createBatchedNotifications } from "@/lib/notifications";
import { loadPriceChanges } from "@/lib/price-changes";
import { aggregateOpenPositions } from "@/lib/signals";
import { fetchNews } from "@/lib/yahoo";

export type AutoWatcherItemResult = {
  instrumentId: string;
  symbol: string;
  pnlAlertFired: boolean;
  dailySummaryFired: boolean;
  dailySummaryDeferred: boolean;
  error?: string;
};

export type AutoWatcherRunResult = {
  processed: number;
  pnlFired: number;
  dailyFired: number;
  dailyDeferred: number;
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

export async function runAutoWatcher(): Promise<AutoWatcherRunResult> {
  const instruments = await db.instrument.findMany({
    where: { autoWatcherEnabled: true },
    select: {
      id: true,
      symbol: true,
      name: true,
      yahooSymbol: true,
      currency: true,
      autoWatcherThreshold: true,
      autoWatcherLastBand: true,
      autoWatcherLastDailyAt: true,
    },
  });

  if (instruments.length === 0) {
    return {
      processed: 0,
      pnlFired: 0,
      dailyFired: 0,
      dailyDeferred: 0,
      skipped: 0,
      failures: [],
    };
  }

  // Aggregate open positions across all portfolios + load price changes once.
  const allPositions = await aggregateOpenPositions();
  const positionMap = new Map(allPositions.map((p) => [p.instrumentId, p]));
  const priceChanges = await loadPriceChanges(instruments.map((i) => i.id));

  let pnlFired = 0;
  let dailyFired = 0;
  let dailyDeferred = 0;
  let skipped = 0;
  let processed = 0;
  const failures: AutoWatcherItemResult[] = [];
  const milestoneNotifications: NotificationBatchCandidate[] = [];
  const dailyNotifications: NotificationBatchCandidate[] = [];

  for (const inst of instruments) {
    const result: AutoWatcherItemResult = {
      instrumentId: inst.id,
      symbol: inst.symbol,
      pnlAlertFired: false,
      dailySummaryFired: false,
      dailySummaryDeferred: false,
    };

    try {
      const position = positionMap.get(inst.id);
      if (!position || !position.quantity || position.quantity.lte(0)) {
        skipped++;
        continue;
      }
      processed++;

      const threshold = new Decimal(inst.autoWatcherThreshold.toString());
      const thresholdNum = threshold.toNumber();
      const stockUrl = `/stocks/${encodeURIComponent(inst.yahooSymbol)}`;

      const pnlPct = position.unrealizedPnLPercent;
      if (pnlPct && !threshold.isZero()) {
        const currentBand = Math.trunc(pnlPct.dividedBy(threshold).toNumber());

        if (inst.autoWatcherLastBand === null) {
          // First evaluation: just record the band, no alert.
          await db.instrument.update({
            where: { id: inst.id },
            data: { autoWatcherLastBand: currentBand },
          });
        } else if (currentBand !== inst.autoWatcherLastBand) {
          const milestonePct = currentBand * thresholdNum;
          const milestoneLabel = `${milestonePct >= 0 ? "+" : ""}${milestonePct}%`;
          const message = formatAutoWatcherMilestoneMessage({
            symbol: inst.symbol,
            pnlPct,
            unrealizedPnL: position.unrealizedPnL,
            pnlCurrency: position.baseCurrency,
            avgCost: position.avgCostInstrument,
            currentPrice: position.marketPrice,
            instrumentCurrency: inst.currency,
          });

          milestoneNotifications.push({
            type: "AUTO_WATCHER",
            groupKey: "autowatcher:milestone",
            title: `${inst.symbol} crossed ${milestoneLabel} milestone`,
            message,
            metadata: {
              kind: "milestone",
              symbol: inst.symbol,
              instrumentId: inst.id,
              currentBand,
              pnlPct: pnlPct.toNumber(),
              unrealizedPnL: position.unrealizedPnL?.toNumber() ?? null,
              pnlCurrency: position.baseCurrency,
              avgCost: position.avgCostInstrument.toNumber(),
              currentPrice: position.marketPrice?.toNumber() ?? null,
              threshold: thresholdNum,
            },
            url: stockUrl,
            priority: 2,
            itemLabel: `${inst.symbol}: crossed ${milestoneLabel}`,
            batchLabelSingular: "AutoWatcher milestone crossed",
            batchLabelPlural: "AutoWatcher milestones crossed",
          });

          await db.instrument.update({
            where: { id: inst.id },
            data: { autoWatcherLastBand: currentBand },
          });

          result.pnlAlertFired = true;
          pnlFired++;
        }
      }

      const now = new Date();
      const ranToday =
        inst.autoWatcherLastDailyAt &&
        isSameDayUtc(inst.autoWatcherLastDailyAt, now);

      if (!ranToday) {
        const pc = priceChanges.get(inst.id);
        if (pc) {
          const dayChangePct = pc.dayPct?.toNumber() ?? 0;

          const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          let recentHeadlines: string[] = [];
          try {
            const newsItems = await fetchNews(inst.yahooSymbol, 8);
            recentHeadlines = newsItems
              .filter((n) => n.publishedAt >= cutoff)
              .map((n) => n.title)
              .slice(0, 5);
          } catch {
            // News fetch failure should not block the rest.
          }

          const shouldFire =
            Math.abs(dayChangePct) >= 1.5 || recentHeadlines.length > 0;

          if (shouldFire) {
            const summary = await generateDailySummary({
              symbol: inst.symbol,
              name: inst.name,
              currency: inst.currency,
              currentPrice: pc.currentPrice.toNumber(),
              dayChangePct,
              weekChangePct: pc.weekPct?.toNumber() ?? null,
              avgCost: position.avgCostInstrument.toNumber(),
              unrealizedPnLPct: pnlPct?.toNumber() ?? null,
              newsHeadlines: recentHeadlines,
            });

            const isImmediate = summary.urgency === "immediate";

            if (isImmediate) {
              dailyNotifications.push({
                type: "AUTO_WATCHER",
                groupKey: "autowatcher:daily:immediate",
                title: `${inst.symbol}: ${summary.headline}`,
                message: summary.summary,
                metadata: {
                  kind: "daily",
                  symbol: inst.symbol,
                  instrumentId: inst.id,
                  sentiment: summary.sentiment,
                  urgency: summary.urgency,
                  dayChangePct,
                  generatedAt: summary.generatedAt,
                },
                url: stockUrl,
                priority: 2,
                itemLabel: `${inst.symbol}: ${summary.headline}`,
                batchLabelSingular: "AutoWatcher daily summary",
                batchLabelPlural: "AutoWatcher daily summaries",
              });
              result.dailySummaryFired = true;
              dailyFired++;
            } else {
              result.dailySummaryDeferred = true;
              dailyDeferred++;
            }
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
    }
  }

  try {
    await createBatchedNotifications(milestoneNotifications, {
      fallbackUrl: "/notifications",
    });
    await createBatchedNotifications(dailyNotifications, {
      fallbackUrl: "/notifications",
    });
  } catch (err) {
    failures.push({
      instrumentId: "notification-batch",
      symbol: "AutoWatcher",
      pnlAlertFired: false,
      dailySummaryFired: false,
      dailySummaryDeferred: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { processed, pnlFired, dailyFired, dailyDeferred, skipped, failures };
}

import type { WeeklyReport } from "@/app/generated/prisma/client";
import { getValueHistoryByGroup } from "@/lib/dashboard";
import { db } from "@/lib/db";
import { toIsoDate, weekEndExclusive } from "@/lib/week-range";
import {
  generateWeeklyReportContent,
  type WeeklyReportContent,
} from "@/lib/weekly-report-ai";

export type WeeklyMover = {
  symbol: string;
  name: string;
  weekChangePercent: number;
  held: boolean;
  watched: boolean;
};

export type WeeklyData = {
  weekStart: string;
  weekEnd: string;
  baseCurrency: string;
  portfolioValue: {
    start: number | null;
    end: number | null;
    changePercent: number | null;
  };
  movers: WeeklyMover[];
  trades: {
    symbol: string;
    type: string;
    quantity: number;
    price: number;
    currency: string;
    date: string;
    portfolio: string;
  }[];
  cashTransactions: {
    type: string;
    amount: number;
    currency: string;
    date: string;
    group: string;
  }[];
  triggeredAlerts: {
    type: string;
    symbol: string | null;
    message: string | null;
  }[];
  reviewsCreated: number;
  reviewsCompleted: { subject: string; action: string | null }[];
  autoWatcherSummaries: { title: string; message: string }[];
  newForecasts: {
    symbol: string;
    targetPrice: number;
    expectedReturn: number | null;
  }[];
};

function sumPoint(point: Record<string, unknown>): number {
  let total = 0;
  for (const [key, value] of Object.entries(point)) {
    if (key === "date") continue;
    if (typeof value === "number") total += value;
  }
  return total;
}

export async function gatherWeeklyData(
  weekStart: Date,
  weekEnd: Date,
): Promise<WeeklyData> {
  const upperExclusive = weekEndExclusive(weekEnd);

  const [
    settings,
    history,
    trades,
    cashTransactions,
    triggeredAlerts,
    reviewsCreated,
    reviewsCompleted,
    autoWatcherNotifications,
    newForecasts,
    watchItems,
    allTradesForHoldings,
  ] = await Promise.all([
    db.settings.findUnique({ where: { id: "singleton" } }),
    getValueHistoryByGroup(40),
    db.trade.findMany({
      where: { date: { gte: weekStart, lt: upperExclusive } },
      orderBy: { date: "asc" },
      include: {
        instrument: { select: { symbol: true } },
        portfolio: { select: { name: true } },
      },
    }),
    db.cashTransaction.findMany({
      where: { date: { gte: weekStart, lt: upperExclusive } },
      orderBy: { date: "asc" },
      include: { group: { select: { name: true } } },
    }),
    db.alert.findMany({
      where: { triggeredAt: { gte: weekStart, lt: upperExclusive } },
      include: { instrument: { select: { symbol: true } } },
    }),
    db.review.count({
      where: { createdAt: { gte: weekStart, lt: upperExclusive } },
    }),
    db.review.findMany({
      where: { decisionDate: { gte: weekStart, lt: upperExclusive } },
      include: {
        instrument: { select: { symbol: true } },
        portfolio: { select: { name: true } },
      },
    }),
    db.notification.findMany({
      where: {
        type: "AUTO_WATCHER",
        createdAt: { gte: weekStart, lt: upperExclusive },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.instrumentForecast.findMany({
      where: {
        source: "AI",
        generatedAt: { gte: weekStart, lt: upperExclusive },
      },
      include: { instrument: { select: { symbol: true } } },
    }),
    db.watchlistItem.findMany({
      where: { status: "WATCHING" },
      include: {
        instrument: { select: { id: true, symbol: true, name: true } },
      },
    }),
    db.trade.findMany({
      select: {
        instrumentId: true,
        type: true,
        quantity: true,
        instrument: { select: { symbol: true, name: true } },
      },
    }),
  ]);

  const baseCurrency = settings?.defaultBaseCurrency ?? "USD";

  // Portfolio value at the week's edges (price-only daily snapshots).
  let valueStart: number | null = null;
  let valueEnd: number | null = null;
  for (const point of history.points) {
    const d = point.date.getTime();
    if (d <= weekStart.getTime()) valueStart = sumPoint(point);
    if (d <= weekEnd.getTime()) valueEnd = sumPoint(point);
  }
  const changePercent =
    valueStart !== null && valueEnd !== null && valueStart !== 0
      ? ((valueEnd - valueStart) / valueStart) * 100
      : null;

  // Held + watched instruments, with display metadata.
  const heldQty = new Map<string, number>();
  const meta = new Map<string, { symbol: string; name: string }>();
  for (const t of allTradesForHoldings) {
    const signed = (t.type === "BUY" ? 1 : -1) * Number(t.quantity);
    heldQty.set(t.instrumentId, (heldQty.get(t.instrumentId) ?? 0) + signed);
    meta.set(t.instrumentId, {
      symbol: t.instrument.symbol,
      name: t.instrument.name,
    });
  }
  const heldIds = new Set<string>();
  for (const [id, qty] of heldQty) if (qty > 1e-8) heldIds.add(id);

  const watchedIds = new Set<string>();
  for (const w of watchItems) {
    watchedIds.add(w.instrument.id);
    if (!meta.has(w.instrument.id)) {
      meta.set(w.instrument.id, {
        symbol: w.instrument.symbol,
        name: w.instrument.name,
      });
    }
  }

  const relevantIds = Array.from(new Set([...heldIds, ...watchedIds]));
  const movers: WeeklyMover[] = [];
  if (relevantIds.length > 0) {
    const prices = await db.priceHistory.findMany({
      where: { instrumentId: { in: relevantIds }, date: { lte: weekEnd } },
      orderBy: [{ instrumentId: "asc" }, { date: "asc" }],
      select: { instrumentId: true, date: true, close: true },
    });
    const byInstrument = new Map<string, { date: Date; close: number }[]>();
    for (const p of prices) {
      let arr = byInstrument.get(p.instrumentId);
      if (!arr) {
        arr = [];
        byInstrument.set(p.instrumentId, arr);
      }
      arr.push({ date: p.date, close: Number(p.close) });
    }
    for (const id of relevantIds) {
      const series = byInstrument.get(id);
      if (!series || series.length === 0) continue;
      let anchor: number | null = null;
      let end: number | null = null;
      for (const row of series) {
        if (row.date.getTime() <= weekStart.getTime()) anchor = row.close;
        if (row.date.getTime() <= weekEnd.getTime()) end = row.close;
      }
      if (anchor === null || end === null || anchor === 0) continue;
      const m = meta.get(id);
      movers.push({
        symbol: m?.symbol ?? id,
        name: m?.name ?? id,
        weekChangePercent: ((end - anchor) / anchor) * 100,
        held: heldIds.has(id),
        watched: watchedIds.has(id),
      });
    }
    movers.sort(
      (a, b) => Math.abs(b.weekChangePercent) - Math.abs(a.weekChangePercent),
    );
  }

  return {
    weekStart: toIsoDate(weekStart),
    weekEnd: toIsoDate(weekEnd),
    baseCurrency,
    portfolioValue: {
      start: valueStart,
      end: valueEnd,
      changePercent,
    },
    movers: movers.slice(0, 10),
    trades: trades.map((t) => ({
      symbol: t.instrument.symbol,
      type: t.type,
      quantity: Number(t.quantity),
      price: Number(t.price),
      currency: t.currency,
      date: toIsoDate(t.date),
      portfolio: t.portfolio.name,
    })),
    cashTransactions: cashTransactions.map((c) => ({
      type: c.type,
      amount: Number(c.amount),
      currency: c.currency,
      date: toIsoDate(c.date),
      group: c.group.name,
    })),
    triggeredAlerts: triggeredAlerts.map((a) => ({
      type: a.type,
      symbol: a.instrument?.symbol ?? null,
      message: a.message,
    })),
    reviewsCreated,
    reviewsCompleted: reviewsCompleted.map((r) => ({
      subject: r.instrument?.symbol ?? r.portfolio?.name ?? "General review",
      action: r.action,
    })),
    autoWatcherSummaries: autoWatcherNotifications.map((n) => ({
      title: n.title,
      message: n.message,
    })),
    newForecasts: newForecasts.map((f) => ({
      symbol: f.instrument.symbol,
      targetPrice: Number(f.targetPrice),
      expectedReturn:
        f.expectedReturn === null ? null : Number(f.expectedReturn),
    })),
  };
}

const REASONING_VALUES = ["minimal", "low", "medium", "high"] as const;
type ReasoningEffort = (typeof REASONING_VALUES)[number];

async function buildWeeklyReport(
  weekStart: Date,
  weekEnd: Date,
): Promise<{ content: WeeklyReportContent; model: string }> {
  const settings = await db.settings.findUnique({
    where: { id: "singleton" },
  });
  const model = settings?.watchlistAiModel ?? "gpt-5.4";
  const reasoning = REASONING_VALUES.includes(
    settings?.watchlistAiReasoning as ReasoningEffort,
  )
    ? (settings?.watchlistAiReasoning as ReasoningEffort)
    : "medium";

  const data = await gatherWeeklyData(weekStart, weekEnd);
  const content = await generateWeeklyReportContent(data, model, reasoning);
  return { content, model };
}

/**
 * Returns the saved report for `weekStart`, generating + persisting it on
 * first request. With `force`, regenerates and overwrites an existing report.
 */
export async function getOrCreateWeeklyReport(
  weekStart: Date,
  weekEnd: Date,
  opts: { force?: boolean } = {},
): Promise<{ report: WeeklyReport; created: boolean }> {
  const existing = await db.weeklyReport.findUnique({ where: { weekStart } });
  if (existing && !opts.force) return { report: existing, created: false };

  const { content, model } = await buildWeeklyReport(weekStart, weekEnd);

  if (existing) {
    const report = await db.weeklyReport.update({
      where: { id: existing.id },
      data: { content, model, weekEnd, generatedAt: new Date() },
    });
    return { report, created: false };
  }

  const report = await db.weeklyReport.create({
    data: { weekStart, weekEnd, content, model },
  });
  return { report, created: true };
}

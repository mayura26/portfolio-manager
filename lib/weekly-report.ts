import type { WeeklyReport } from "@/app/generated/prisma/client";
import { getValueHistoryByGroup } from "@/lib/dashboard";
import { db } from "@/lib/db";
import { visibleTradeWhere } from "@/lib/portfolio-visibility";
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

export type WeeklyTradeActivity = {
  symbol: string;
  type: string;
  quantity: number;
  price: number;
  currency: string;
  date: string;
  portfolio: string;
};

export type WeeklyCashActivity = {
  type: string;
  amount: number;
  currency: string;
  date: string;
  group: string;
};

export type WeeklyReviewActivity = {
  subject: string;
  action: string | null;
};

export type WeeklyGroupData = {
  id: string;
  name: string;
  description: string | null;
  baseCurrency: string;
  profile: {
    investmentObjective: string | null;
    riskTolerance: string | null;
    timeHorizon: string | null;
    liquidityNeed: string | null;
    notes: string | null;
  };
  portfolioValue: {
    start: number | null;
    end: number | null;
    changePercent: number | null;
  };
  movers: WeeklyMover[];
  trades: WeeklyTradeActivity[];
  cashTransactions: WeeklyCashActivity[];
  triggeredAlerts: {
    type: string;
    symbol: string | null;
    message: string | null;
  }[];
  reviewsCreated: number;
  reviewsCompleted: WeeklyReviewActivity[];
  newForecasts: {
    symbol: string;
    targetPrice: number;
    expectedReturn: number | null;
  }[];
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
  groups: WeeklyGroupData[];
  trades: WeeklyTradeActivity[];
  cashTransactions: WeeklyCashActivity[];
  triggeredAlerts: {
    type: string;
    symbol: string | null;
    message: string | null;
  }[];
  reviewsCreated: number;
  reviewsCompleted: WeeklyReviewActivity[];
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

function percentChange(
  start: number | null,
  end: number | null,
): number | null {
  return start !== null && end !== null && start !== 0
    ? ((end - start) / start) * 100
    : null;
}

function groupPointValue(
  point: Record<string, unknown>,
  groupId: string,
): number {
  const equity = point[`g_${groupId}_eq`];
  const cash = point[`g_${groupId}_cash`];
  return (
    (typeof equity === "number" ? equity : 0) +
    (typeof cash === "number" ? cash : 0)
  );
}

function pushToBucket<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const bucket = map.get(key);
  if (bucket) {
    bucket.push(value);
    return;
  }
  map.set(key, [value]);
}

function buildInstrumentMovers({
  instrumentIds,
  heldIds,
  watchedIds,
  meta,
  pricesByInstrument,
  weekStart,
  weekEnd,
}: {
  instrumentIds: string[];
  heldIds: Set<string>;
  watchedIds: Set<string>;
  meta: Map<string, { symbol: string; name: string }>;
  pricesByInstrument: Map<string, { date: Date; close: number }[]>;
  weekStart: Date;
  weekEnd: Date;
}): WeeklyMover[] {
  const movers: WeeklyMover[] = [];

  for (const id of instrumentIds) {
    const series = pricesByInstrument.get(id);
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
  return movers;
}

export async function gatherWeeklyData(
  weekStart: Date,
  weekEnd: Date,
): Promise<WeeklyData> {
  const upperExclusive = weekEndExclusive(weekEnd);

  const [
    settings,
    groups,
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
    db.portfolioGroup.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        baseCurrency: true,
        investmentObjective: true,
        riskTolerance: true,
        timeHorizon: true,
        liquidityNeed: true,
        investmentProfileNotes: true,
      },
      orderBy: { name: "asc" },
    }),
    getValueHistoryByGroup(40),
    db.trade.findMany({
      where: {
        ...visibleTradeWhere,
        date: { gte: weekStart, lt: upperExclusive },
      },
      orderBy: { date: "asc" },
      include: {
        instrument: { select: { symbol: true } },
        portfolio: { select: { name: true, groupId: true } },
      },
    }),
    db.cashTransaction.findMany({
      where: { date: { gte: weekStart, lt: upperExclusive } },
      orderBy: { date: "asc" },
      include: { group: { select: { id: true, name: true } } },
    }),
    db.alert.findMany({
      where: { triggeredAt: { gte: weekStart, lt: upperExclusive } },
      include: {
        instrument: { select: { symbol: true } },
        portfolio: { select: { groupId: true } },
      },
    }),
    db.review.findMany({
      where: { createdAt: { gte: weekStart, lt: upperExclusive } },
      include: {
        instrument: { select: { symbol: true } },
        portfolio: { select: { name: true, groupId: true } },
      },
    }),
    db.review.findMany({
      where: { decisionDate: { gte: weekStart, lt: upperExclusive } },
      include: {
        instrument: { select: { symbol: true } },
        portfolio: { select: { name: true, groupId: true } },
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
      include: { instrument: { select: { id: true, symbol: true } } },
    }),
    db.watchlistItem.findMany({
      where: { status: "WATCHING" },
      include: {
        instrument: { select: { id: true, symbol: true, name: true } },
        portfolio: { select: { groupId: true } },
      },
    }),
    db.trade.findMany({
      where: visibleTradeWhere,
      select: {
        instrumentId: true,
        type: true,
        quantity: true,
        instrument: { select: { symbol: true, name: true } },
        portfolio: { select: { groupId: true } },
      },
    }),
  ]);

  const baseCurrency = settings?.defaultBaseCurrency ?? "USD";

  // Portfolio value at the week's edges, including group cash bands.
  let valueStart: number | null = null;
  let valueEnd: number | null = null;
  const groupValues = new Map<
    string,
    { start: number | null; end: number | null }
  >();
  for (const group of groups) {
    groupValues.set(group.id, { start: null, end: null });
  }

  for (const point of history.points) {
    const d = point.date.getTime();
    if (d <= weekStart.getTime()) valueStart = sumPoint(point);
    if (d <= weekEnd.getTime()) valueEnd = sumPoint(point);

    for (const group of groups) {
      const bucket = groupValues.get(group.id);
      if (!bucket) continue;
      const groupValue = groupPointValue(point, group.id);
      if (d <= weekStart.getTime()) bucket.start = groupValue;
      if (d <= weekEnd.getTime()) bucket.end = groupValue;
    }
  }
  const changePercent = percentChange(valueStart, valueEnd);

  // Held + watched instruments, both globally and per portfolio group.
  const heldQty = new Map<string, number>();
  const heldQtyByGroup = new Map<string, Map<string, number>>();
  const meta = new Map<string, { symbol: string; name: string }>();
  for (const t of allTradesForHoldings) {
    const signed = (t.type === "BUY" ? 1 : -1) * Number(t.quantity);
    heldQty.set(t.instrumentId, (heldQty.get(t.instrumentId) ?? 0) + signed);

    let groupQty = heldQtyByGroup.get(t.portfolio.groupId);
    if (!groupQty) {
      groupQty = new Map<string, number>();
      heldQtyByGroup.set(t.portfolio.groupId, groupQty);
    }
    groupQty.set(t.instrumentId, (groupQty.get(t.instrumentId) ?? 0) + signed);

    meta.set(t.instrumentId, {
      symbol: t.instrument.symbol,
      name: t.instrument.name,
    });
  }
  const heldIds = new Set<string>();
  for (const [id, qty] of heldQty) if (qty > 1e-8) heldIds.add(id);

  const watchedIds = new Set<string>();
  const watchedIdsByGroup = new Map<string, Set<string>>();
  for (const w of watchItems) {
    watchedIds.add(w.instrument.id);
    if (w.portfolio?.groupId) {
      let groupWatched = watchedIdsByGroup.get(w.portfolio.groupId);
      if (!groupWatched) {
        groupWatched = new Set<string>();
        watchedIdsByGroup.set(w.portfolio.groupId, groupWatched);
      }
      groupWatched.add(w.instrument.id);
    }
    if (!meta.has(w.instrument.id)) {
      meta.set(w.instrument.id, {
        symbol: w.instrument.symbol,
        name: w.instrument.name,
      });
    }
  }

  const relevantIds = Array.from(new Set([...heldIds, ...watchedIds]));
  let movers: WeeklyMover[] = [];
  const pricesByInstrument = new Map<string, { date: Date; close: number }[]>();
  if (relevantIds.length > 0) {
    const prices = await db.priceHistory.findMany({
      where: { instrumentId: { in: relevantIds }, date: { lte: weekEnd } },
      orderBy: [{ instrumentId: "asc" }, { date: "asc" }],
      select: { instrumentId: true, date: true, close: true },
    });
    for (const p of prices) {
      let arr = pricesByInstrument.get(p.instrumentId);
      if (!arr) {
        arr = [];
        pricesByInstrument.set(p.instrumentId, arr);
      }
      arr.push({ date: p.date, close: Number(p.close) });
    }

    movers = buildInstrumentMovers({
      instrumentIds: relevantIds,
      heldIds,
      watchedIds,
      meta,
      pricesByInstrument,
      weekStart,
      weekEnd,
    });
  }

  const weeklyTrades: WeeklyTradeActivity[] = trades.map((t) => ({
    symbol: t.instrument.symbol,
    type: t.type,
    quantity: Number(t.quantity),
    price: Number(t.price),
    currency: t.currency,
    date: toIsoDate(t.date),
    portfolio: t.portfolio.name,
  }));
  const tradesByGroup = new Map<string, WeeklyTradeActivity[]>();
  for (let i = 0; i < trades.length; i++) {
    pushToBucket(tradesByGroup, trades[i].portfolio.groupId, weeklyTrades[i]);
  }

  const weeklyCashTransactions: WeeklyCashActivity[] = cashTransactions.map(
    (c) => ({
      type: c.type,
      amount: Number(c.amount),
      currency: c.currency,
      date: toIsoDate(c.date),
      group: c.group.name,
    }),
  );
  const cashTransactionsByGroup = new Map<string, WeeklyCashActivity[]>();
  for (let i = 0; i < cashTransactions.length; i++) {
    pushToBucket(
      cashTransactionsByGroup,
      cashTransactions[i].group.id,
      weeklyCashTransactions[i],
    );
  }

  const weeklyAlerts = triggeredAlerts.map((a) => ({
    type: a.type,
    symbol: a.instrument?.symbol ?? null,
    message: a.message,
  }));
  const alertsByGroup = new Map<string, (typeof weeklyAlerts)[number][]>();
  for (let i = 0; i < triggeredAlerts.length; i++) {
    const groupId = triggeredAlerts[i].portfolio?.groupId;
    if (groupId) pushToBucket(alertsByGroup, groupId, weeklyAlerts[i]);
  }

  const reviewsCreatedByGroup = new Map<string, number>();
  for (const review of reviewsCreated) {
    const groupId = review.portfolio?.groupId;
    if (!groupId) continue;
    reviewsCreatedByGroup.set(
      groupId,
      (reviewsCreatedByGroup.get(groupId) ?? 0) + 1,
    );
  }

  const weeklyCompletedReviews: WeeklyReviewActivity[] = reviewsCompleted.map(
    (r) => ({
      subject: r.instrument?.symbol ?? r.portfolio?.name ?? "General review",
      action: r.action,
    }),
  );
  const completedReviewsByGroup = new Map<string, WeeklyReviewActivity[]>();
  for (let i = 0; i < reviewsCompleted.length; i++) {
    const groupId = reviewsCompleted[i].portfolio?.groupId;
    if (groupId) {
      pushToBucket(completedReviewsByGroup, groupId, weeklyCompletedReviews[i]);
    }
  }

  const weeklyForecasts = newForecasts.map((f) => ({
    symbol: f.instrument.symbol,
    targetPrice: Number(f.targetPrice),
    expectedReturn: f.expectedReturn === null ? null : Number(f.expectedReturn),
  }));

  const reportGroups: WeeklyGroupData[] = groups.map((group) => {
    const groupHeldIds = new Set<string>();
    for (const [id, qty] of heldQtyByGroup.get(group.id) ?? new Map()) {
      if (qty > 1e-8) groupHeldIds.add(id);
    }
    const groupWatchedIds =
      watchedIdsByGroup.get(group.id) ?? new Set<string>();
    const groupRelevantIds = Array.from(
      new Set([...groupHeldIds, ...groupWatchedIds]),
    );
    const values = groupValues.get(group.id) ?? { start: null, end: null };

    return {
      id: group.id,
      name: group.name,
      description: group.description,
      baseCurrency: group.baseCurrency,
      profile: {
        investmentObjective: group.investmentObjective,
        riskTolerance: group.riskTolerance,
        timeHorizon: group.timeHorizon,
        liquidityNeed: group.liquidityNeed,
        notes: group.investmentProfileNotes,
      },
      portfolioValue: {
        start: values.start,
        end: values.end,
        changePercent: percentChange(values.start, values.end),
      },
      movers: buildInstrumentMovers({
        instrumentIds: groupRelevantIds,
        heldIds: groupHeldIds,
        watchedIds: groupWatchedIds,
        meta,
        pricesByInstrument,
        weekStart,
        weekEnd,
      }).slice(0, 6),
      trades: tradesByGroup.get(group.id) ?? [],
      cashTransactions: cashTransactionsByGroup.get(group.id) ?? [],
      triggeredAlerts: alertsByGroup.get(group.id) ?? [],
      reviewsCreated: reviewsCreatedByGroup.get(group.id) ?? 0,
      reviewsCompleted: completedReviewsByGroup.get(group.id) ?? [],
      newForecasts: newForecasts
        .filter((forecast) => groupRelevantIds.includes(forecast.instrument.id))
        .map((forecast) => ({
          symbol: forecast.instrument.symbol,
          targetPrice: Number(forecast.targetPrice),
          expectedReturn:
            forecast.expectedReturn === null
              ? null
              : Number(forecast.expectedReturn),
        })),
    };
  });

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
    groups: reportGroups,
    trades: weeklyTrades,
    cashTransactions: weeklyCashTransactions,
    triggeredAlerts: weeklyAlerts,
    reviewsCreated: reviewsCreated.length,
    reviewsCompleted: weeklyCompletedReviews,
    autoWatcherSummaries: autoWatcherNotifications.map((n) => ({
      title: n.title,
      message: n.message,
    })),
    newForecasts: weeklyForecasts,
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

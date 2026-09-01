import { computeGroupCash } from "@/lib/cash";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { visibleTradeWhere } from "@/lib/portfolio-visibility";

export type AuditCategory =
  | "allocation"
  | "price-targets"
  | "watchlist"
  | "hygiene";

export type AuditGap = {
  key: string;
  category: AuditCategory;
  title: string;
  detail: string;
  fixHref: string;
};

export type AuditCategoryGroup = {
  category: AuditCategory;
  label: string;
  blurb: string;
  gaps: AuditGap[];
};

export type AuditResult = {
  categories: AuditCategoryGroup[];
  muted: AuditGap[];
  activeCount: number;
  mutedCount: number;
};

const CATEGORY_META: Record<AuditCategory, { label: string; blurb: string }> = {
  allocation: {
    label: "Allocation targets",
    blurb:
      "Without target bands, drift alerts and rebalancing have nothing to measure against.",
  },
  "price-targets": {
    label: "Buy / sell / trim stance",
    blurb:
      "Each target needs one clear action so the review stays decision-oriented.",
  },
  watchlist: {
    label: "Watchlist completeness",
    blurb:
      "A watched name needs a buy zone and an alert before it can catch your eye.",
  },
  hygiene: {
    label: "Profile & data hygiene",
    blurb:
      "Missing context quietly weakens suitability checks and performance accuracy.",
  },
};

const CATEGORY_ORDER: AuditCategory[] = [
  "allocation",
  "price-targets",
  "watchlist",
  "hygiene",
];

const QTY_EPSILON = 1e-8;

function isZero(value: { toString(): string }): boolean {
  return Number(value) === 0;
}

export async function runSetupAudit(): Promise<AuditResult> {
  const [groups, targets, watchItems, trades, mutedRows] = await Promise.all([
    db.portfolioGroup.findMany({
      include: { portfolios: { orderBy: { name: "asc" } } },
      orderBy: { name: "asc" },
    }),
    db.portfolioTarget.findMany({
      include: { instrument: true, portfolio: true },
    }),
    db.watchlistItem.findMany({
      where: { status: "WATCHING" },
      include: { instrument: true },
      orderBy: { createdAt: "desc" },
    }),
    db.trade.findMany({
      where: visibleTradeWhere,
      orderBy: { date: "asc" },
      select: {
        id: true,
        portfolioId: true,
        instrumentId: true,
        type: true,
        quantity: true,
        currency: true,
        fxRate: true,
        date: true,
        portfolio: { select: { baseCurrency: true, name: true } },
        instrument: {
          select: {
            symbol: true,
            yahooSymbol: true,
            name: true,
            sector: true,
            instrumentType: true,
          },
        },
      },
    }),
    db.mutedAuditCheck.findMany(),
  ]);

  const mutedKeys = new Set(mutedRows.map((r) => r.checkKey));
  const gaps: AuditGap[] = [];

  // Net position per portfolio:instrument, plus instrument metadata.
  type InstrumentMeta = {
    symbol: string;
    yahooSymbol: string;
    name: string;
    sector: string | null;
    instrumentType: string;
  };
  const heldQty = new Map<string, number>();
  const portfolioName = new Map<string, string>();
  const instrumentMeta = new Map<string, InstrumentMeta>();

  for (const t of trades) {
    const pairKey = `${t.portfolioId}:${t.instrumentId}`;
    const signed = (t.type === "BUY" ? 1 : -1) * Number(t.quantity);
    heldQty.set(pairKey, (heldQty.get(pairKey) ?? 0) + signed);
    portfolioName.set(t.portfolioId, t.portfolio.name);
    instrumentMeta.set(t.instrumentId, {
      symbol: t.instrument.symbol,
      yahooSymbol: t.instrument.yahooSymbol,
      name: t.instrument.name,
      sector: t.instrument.sector,
      instrumentType: t.instrument.instrumentType,
    });
  }

  // ── Allocation targets ─────────────────────────────────────
  for (const group of groups) {
    const cash = await computeGroupCash(group.id);
    if (
      isZero(group.cashTargetMinPercent) &&
      isZero(group.cashTargetMaxPercent)
    ) {
      gaps.push({
        key: `group-cash:${group.id}`,
        category: "allocation",
        title: `No cash target band — ${group.name}`,
        detail:
          "Set a min/max cash weight so allocation drift can flag when this group runs hot or cash-heavy.",
        fixHref: `/groups/${group.id}/settings`,
      });
    }
    if (
      !cash.cashInvestments.isZero() &&
      isZero(group.hisaTargetMinPercent) &&
      isZero(group.hisaTargetMaxPercent)
    ) {
      gaps.push({
        key: `group-hisa:${group.id}`,
        category: "allocation",
        title: `No HISA target band - ${group.name}`,
        detail:
          "This group has a HISA balance from imported savings statements. Set a min/max HISA weight so it is measured separately from pure cash.",
        fixHref: `/groups/${group.id}/settings`,
      });
    }
    for (const portfolio of group.portfolios) {
      if (
        isZero(portfolio.targetMinPercentInGroup) &&
        isZero(portfolio.targetMaxPercentInGroup)
      ) {
        gaps.push({
          key: `portfolio-weight:${portfolio.id}`,
          category: "allocation",
          title: `No weight target — ${portfolio.name}`,
          detail: `This portfolio has no target weight inside ${group.name}, so group-level rebalancing can't size it.`,
          fixHref: `/portfolios/${portfolio.id}/settings`,
        });
      }
    }
  }

  const targetPairKeys = new Set(
    targets.map((t) => `${t.portfolioId}:${t.instrumentId}`),
  );
  for (const [pairKey, qty] of heldQty) {
    if (qty <= QTY_EPSILON) continue;
    if (targetPairKeys.has(pairKey)) continue;
    const [portfolioId, instrumentId] = pairKey.split(":");
    const meta = instrumentMeta.get(instrumentId);
    gaps.push({
      key: `holding-untargeted:${pairKey}`,
      category: "allocation",
      title: `No allocation target — ${meta?.symbol ?? instrumentId}`,
      detail: `Held in ${portfolioName.get(portfolioId) ?? "a portfolio"} with no target weight. Add a target so it appears in composition analysis.`,
      fixHref: `/portfolios/${portfolioId}/targets`,
    });
  }

  for (const target of targets) {
    const label = `${target.instrument.symbol} in ${target.portfolio.name}`;
    if (isZero(target.targetMinPercent) && isZero(target.targetMaxPercent)) {
      gaps.push({
        key: `target-band:${target.id}`,
        category: "allocation",
        title: `No allocation band — ${target.instrument.symbol}`,
        detail: `${label} has a target but no min/max band, so drift can't be measured.`,
        fixHref: `/portfolios/${target.portfolioId}/targets`,
      });
    }

    // ── Buy / sell / trim recommendation ─────────────────────
    if (target.recommendationAction === null) {
      gaps.push({
        key: `target-recommendation:${target.id}`,
        category: "price-targets",
        title: `No buy/sell/trim stance - ${target.instrument.symbol}`,
        detail: `${label} needs one actionable stance: buy, sell, or trim. Use AI generation or set it manually on the Targets tab.`,
        fixHref: `/portfolios/${target.portfolioId}/targets`,
      });
    }
  }

  // ── Watchlist completeness ──────────────────────────────────
  for (const item of watchItems) {
    const symbol = item.instrument.symbol;
    if (item.buyRangeLow === null || item.buyRangeHigh === null) {
      gaps.push({
        key: `watch-buyzone:${item.id}`,
        category: "watchlist",
        title: `No buy zone — ${symbol}`,
        detail:
          "Without a buy range there's no entry to watch for or alert on.",
        fixHref: "/watchlist",
      });
    }
    if (item.aiAnalysis === null) {
      gaps.push({
        key: `watch-ai:${item.id}`,
        category: "watchlist",
        title: `AI buy-zone analysis not run — ${symbol}`,
        detail:
          "Run the AI analysis to get a suggested entry range and rationale.",
        fixHref: "/watchlist",
      });
    }
    if (item.alertId === null) {
      gaps.push({
        key: `watch-alert:${item.id}`,
        category: "watchlist",
        title: `No price alert linked — ${symbol}`,
        detail:
          "Link a price alert so an entry into the buy zone reaches your queue.",
        fixHref: "/watchlist",
      });
    }
  }

  // ── Profile & data hygiene ──────────────────────────────────
  for (const group of groups) {
    const missing: string[] = [];
    if (!group.investmentObjective) missing.push("objective");
    if (!group.riskTolerance) missing.push("risk tolerance");
    if (!group.timeHorizon) missing.push("time horizon");
    if (!group.liquidityNeed) missing.push("liquidity need");
    if (missing.length > 0) {
      gaps.push({
        key: `group-profile:${group.id}`,
        category: "hygiene",
        title: `Investment profile incomplete — ${group.name}`,
        detail: `Missing ${missing.join(", ")}. Composition analysis uses this to judge suitability.`,
        fixHref: `/groups/${group.id}/settings`,
      });
    }
  }

  const watchedInstrumentIds = new Set(watchItems.map((w) => w.instrumentId));
  for (const item of watchItems) {
    if (!instrumentMeta.has(item.instrumentId)) {
      instrumentMeta.set(item.instrumentId, {
        symbol: item.instrument.symbol,
        yahooSymbol: item.instrument.yahooSymbol,
        name: item.instrument.name,
        sector: item.instrument.sector,
        instrumentType: item.instrument.instrumentType,
      });
    }
  }

  const heldInstrumentIds = new Set<string>();
  for (const [pairKey, qty] of heldQty) {
    if (qty > QTY_EPSILON) heldInstrumentIds.add(pairKey.split(":")[1]);
  }
  const relevantInstrumentIds = new Set([
    ...heldInstrumentIds,
    ...watchedInstrumentIds,
  ]);
  for (const instrumentId of relevantInstrumentIds) {
    const meta = instrumentMeta.get(instrumentId);
    if (!meta || meta.sector) continue;
    gaps.push({
      key: `instrument-sector:${instrumentId}`,
      category: "hygiene",
      title: `Sector / exposure bucket missing — ${meta.symbol}`,
      detail: `${meta.instrumentType} profile has no sector saved. Yahoo profile data can be blank for ETFs, funds, commodity products, or sparse exchange profiles; set a sector or custom bucket so exposure includes it.`,
      fixHref: `/stocks/${encodeURIComponent(meta.yahooSymbol)}`,
    });
  }

  for (const t of trades) {
    if (t.currency === t.portfolio.baseCurrency) continue;
    if (t.fxRate !== null) continue;
    gaps.push({
      key: `trade-fx:${t.id}`,
      category: "hygiene",
      title: `FX rate missing on trade — ${t.instrument.symbol}`,
      detail: `${t.type} on ${formatDate(t.date)} in ${t.currency} has no FX rate, so it's converted 1:1 — distorting cost basis.`,
      fixHref: `/portfolios/${t.portfolioId}/trades/${t.id}`,
    });
  }

  // ── Split active vs muted, group by category ────────────────
  const active = gaps.filter((g) => !mutedKeys.has(g.key));
  const muted = gaps.filter((g) => mutedKeys.has(g.key));

  const categories: AuditCategoryGroup[] = CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_META[category].label,
    blurb: CATEGORY_META[category].blurb,
    gaps: active.filter((g) => g.category === category),
  }));

  return {
    categories,
    muted,
    activeCount: active.length,
    mutedCount: muted.length,
  };
}

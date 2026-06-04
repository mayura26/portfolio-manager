import { blendScore } from "@/lib/congress-trades";
import { db } from "@/lib/db";

// ─────────────────────────────────────────────────────────────
// Cross-source signal blending
//
// Merges government (CongressTrade: House + Senate) and corporate insider
// (InsiderTrade: SEC Form 4) activity into a single per-ticker leaderboard so
// you can see, at a glance, where smart money across every source overlaps.
// ─────────────────────────────────────────────────────────────

export type SourceTally = { buy: number; sell: number; volume: number };

export type CrossSourceTicker = {
  ticker: string;
  sector: string | null;
  house: SourceTally;
  senate: SourceTally;
  insider: SourceTally;
  sources: ("House" | "Senate" | "Insider")[];
  totalCount: number;
  totalVolume: number;
  netVolume: number; // buy $ − sell $ across all sources
};

const emptyTally = (): SourceTally => ({ buy: 0, sell: 0, volume: 0 });

function isBuy(transaction: string): boolean {
  return transaction === "Purchase";
}
function isSell(transaction: string): boolean {
  return transaction === "Sale" || transaction === "Sale (Partial)";
}

export async function getCrossSourceTopTickers(opts: {
  since: Date;
  limit?: number;
}): Promise<CrossSourceTicker[]> {
  const { since, limit = 15 } = opts;
  const where = { transactionDate: { gte: since } };

  const [congress, congressChambers, congressSectors, insider, insiderSectors] =
    await Promise.all([
      db.congressTrade.groupBy({
        by: ["ticker", "transaction", "chamber"],
        where,
        _count: { _all: true },
        _sum: { amountMid: true },
      }),
      db.congressTrade.findMany({
        where,
        select: { ticker: true, chamber: true },
        distinct: ["ticker", "chamber"],
      }),
      db.congressTrade.findMany({
        where: { ...where, sector: { not: null } },
        select: { ticker: true, sector: true },
        distinct: ["ticker"],
      }),
      db.insiderTrade.groupBy({
        by: ["ticker", "transaction"],
        where,
        _count: { _all: true },
        _sum: { value: true },
      }),
      db.insiderTrade.findMany({
        where: { ...where, sector: { not: null } },
        select: { ticker: true, sector: true },
        distinct: ["ticker"],
      }),
    ]);

  const map = new Map<string, CrossSourceTicker>();
  const get = (ticker: string): CrossSourceTicker => {
    let row = map.get(ticker);
    if (!row) {
      row = {
        ticker,
        sector: null,
        house: emptyTally(),
        senate: emptyTally(),
        insider: emptyTally(),
        sources: [],
        totalCount: 0,
        totalVolume: 0,
        netVolume: 0,
      };
      map.set(ticker, row);
    }
    return row;
  };

  // Government rows → House / Senate tallies.
  for (const g of congress) {
    const row = get(g.ticker);
    const tally = g.chamber === "Senate" ? row.senate : row.house;
    const count = g._count._all;
    const vol = g._sum.amountMid ?? 0;
    if (isBuy(g.transaction)) tally.buy += count;
    else if (isSell(g.transaction)) tally.sell += count;
    tally.volume += vol;
    row.totalCount += count;
    row.totalVolume += vol;
    if (isBuy(g.transaction)) row.netVolume += vol;
    else if (isSell(g.transaction)) row.netVolume -= vol;
  }

  // Insider rows → insider tally.
  for (const i of insider) {
    const row = get(i.ticker);
    const count = i._count._all;
    const vol = i._sum.value ?? 0;
    if (isBuy(i.transaction)) row.insider.buy += count;
    else if (isSell(i.transaction)) row.insider.sell += count;
    row.insider.volume += vol;
    row.totalCount += count;
    row.totalVolume += vol;
    if (isBuy(i.transaction)) row.netVolume += vol;
    else if (isSell(i.transaction)) row.netVolume -= vol;
  }

  // Which sources/chambers are present.
  for (const c of congressChambers) {
    const row = map.get(c.ticker);
    if (!row) continue;
    const label = c.chamber === "Senate" ? "Senate" : "House";
    if (!row.sources.includes(label)) row.sources.push(label);
  }
  for (const row of map.values()) {
    if (row.insider.buy + row.insider.sell > 0) row.sources.push("Insider");
  }

  // Sector labels (congress first, fall back to insider).
  const sectorMap = new Map<string, string>();
  for (const s of insiderSectors)
    if (s.sector) sectorMap.set(s.ticker, s.sector);
  for (const s of congressSectors)
    if (s.sector) sectorMap.set(s.ticker, s.sector);
  for (const row of map.values())
    row.sector = sectorMap.get(row.ticker) ?? null;

  // Rank by blended activity (breadth + dollar size), like the Top Bought/Sold
  // tables, so one whale trade doesn't dominate over broad participation.
  const rows = Array.from(map.values());
  const maxCount = Math.max(0, ...rows.map((r) => r.totalCount));
  const maxVolume = Math.max(0, ...rows.map((r) => r.totalVolume));
  rows.sort(
    (a, b) =>
      blendScore(b.totalCount, b.totalVolume, maxCount, maxVolume) -
      blendScore(a.totalCount, a.totalVolume, maxCount, maxVolume),
  );

  return rows.slice(0, limit);
}

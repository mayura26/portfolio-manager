"use client";

import { ArrowUpRight, ChevronDown, LineChart, Search, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  StockCard,
  type StockCardContext,
} from "@/components/stocks/stock-card";

type Tone = "gain" | "loss" | "neutral";

export type StocksSearchStock = {
  id: string;
  instrument: {
    yahooSymbol: string;
    symbol: string;
    name: string;
    currency: string;
    exchange: string;
    sector: string | null;
  };
  context: StockCardContext;
  searchText: string;
};

export type StocksSearchGroup = {
  id: string | null;
  name: string;
  stocks: StocksSearchStock[];
  summary: {
    marketValue: string;
    unrealizedPnl: string;
    unrealizedPercent: string | null;
    tone: Tone;
    hasMissingPrices: boolean;
  } | null;
};

type Props = {
  groups: StocksSearchGroup[];
};

export function StocksSearchList({ groups }: Props) {
  const [query, setQuery] = useState("");
  const [openGroupIds, setOpenGroupIds] = useState<Set<string>>(
    () => new Set(),
  );
  const tokens = useMemo(() => tokenize(query), [query]);
  const hasQuery = tokens.length > 0;

  const filteredGroups = useMemo(
    () =>
      groups
        .map((group) => {
          const stocks = hasQuery
            ? group.stocks.filter((stock) =>
                tokens.every((token) => stock.searchText.includes(token)),
              )
            : group.stocks;
          return { ...group, stocks, totalStocks: group.stocks.length };
        })
        .filter((group) => group.stocks.length > 0),
    [groups, hasQuery, tokens],
  );

  const totalStocks = groups.reduce(
    (sum, group) => sum + group.stocks.length,
    0,
  );
  const visibleStocks = filteredGroups.reduce(
    (sum, group) => sum + group.stocks.length,
    0,
  );

  function toggleGroup(groupKey: string) {
    setOpenGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="hairline bg-surface px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block flex-1" htmlFor="stocks-search">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
              strokeWidth={1.5}
              aria-hidden
            />
            <input
              id="stocks-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search ticker, company, exchange, sector, or portfolio"
              className="hairline w-full bg-surface-elevated px-9 py-2 text-sm text-foreground placeholder:text-subtle"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear stock search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-subtle transition-colors hover:bg-border hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            ) : null}
          </label>
          <p className="shrink-0 text-xs text-muted">
            <span className="tabular text-foreground">{visibleStocks}</span>
            {hasQuery ? ` of ${totalStocks}` : ""}{" "}
            {totalStocks === 1 ? "stock" : "stocks"}
          </p>
        </div>
      </div>

      {filteredGroups.length > 0 ? (
        <div className="flex flex-col gap-4">
          {filteredGroups.map((group) => {
            const groupKey = group.id ?? "none";
            const isExpanded = hasQuery || openGroupIds.has(groupKey);
            return (
              <PortfolioStockSection
                key={groupKey}
                group={group}
                isExpanded={isExpanded}
                hasQuery={hasQuery}
                onToggle={() => toggleGroup(groupKey)}
              />
            );
          })}
        </div>
      ) : (
        <div className="hairline flex flex-col items-center bg-surface px-5 py-10 text-center">
          <LineChart
            className="h-8 w-8 text-subtle"
            strokeWidth={1.5}
            aria-hidden
          />
          <h2 className="display mt-3 text-2xl text-foreground">
            No stocks match
          </h2>
          <p className="mt-2 max-w-sm text-sm text-muted">
            Try a ticker, company name, exchange, sector, or portfolio name from
            the stocks already in your universe.
          </p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="mt-4 text-sm text-accent hover:underline"
          >
            Clear search
          </button>
        </div>
      )}
    </div>
  );
}

function PortfolioStockSection({
  group,
  isExpanded,
  hasQuery,
  onToggle,
}: {
  group: StocksSearchGroup & { totalStocks: number };
  isExpanded: boolean;
  hasQuery: boolean;
  onToggle: () => void;
}) {
  const stockLabel = group.totalStocks === 1 ? "stock" : "stocks";
  const countText = hasQuery
    ? `${group.stocks.length} / ${group.totalStocks} ${stockLabel}`
    : `${group.totalStocks} ${stockLabel}`;

  return (
    <section className="flex flex-col gap-3">
      <div className="hairline bg-surface transition-colors hover:border-border-strong">
        <div className="flex items-stretch gap-2">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isExpanded}
            className="flex min-w-0 flex-1 items-center gap-3 px-4 py-4 text-left"
          >
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-subtle transition-transform ${isExpanded ? "rotate-180" : ""}`}
              strokeWidth={1.5}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="display truncate text-2xl text-foreground">
                  {group.name}
                </h2>
                <span className="label text-[10px]">{countText}</span>
              </div>
              {group.summary ? (
                <PortfolioSummary summary={group.summary} />
              ) : (
                <p className="mt-1 text-xs text-muted">
                  Tracked without a portfolio position summary.
                </p>
              )}
            </div>
          </button>

          {group.id ? (
            <Link
              href={`/portfolios/${group.id}`}
              className="hidden items-center gap-1 border-l border-border px-4 text-xs text-muted transition-colors hover:bg-surface-elevated hover:text-accent sm:inline-flex"
            >
              Open
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.5} />
            </Link>
          ) : null}
        </div>
      </div>

      {isExpanded ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {group.stocks.map(({ id, instrument, context }) => (
            <StockCard
              key={`${group.id ?? "none"}-${id}`}
              instrument={instrument}
              context={context}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function PortfolioSummary({
  summary,
}: {
  summary: NonNullable<StocksSearchGroup["summary"]>;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <SummaryMetric label="Value" value={summary.marketValue} />
      <SummaryMetric
        label="Unrealized"
        value={summary.unrealizedPnl}
        tone={summary.tone}
      />
      {summary.unrealizedPercent ? (
        <SummaryMetric
          label="Return"
          value={summary.unrealizedPercent}
          tone={summary.tone}
        />
      ) : null}
      {summary.hasMissingPrices ? (
        <span className="label inline-flex items-center gap-1 text-[10px] text-warning">
          <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden />
          Missing prices
        </span>
      ) : null}
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="label text-[10px] text-subtle">{label}</span>
      <span className={`tabular ${toneClass(tone)}`}>{value}</span>
    </span>
  );
}

function toneClass(tone: Tone) {
  if (tone === "gain") return "text-gain";
  if (tone === "loss") return "text-loss";
  return "text-foreground";
}

function tokenize(value: string) {
  return value.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

import type Decimal from "decimal.js";
import { ArrowDownRight, ArrowUpRight, Trophy } from "lucide-react";
import Link from "next/link";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";
import type { DayContributor, StatsView } from "@/lib/stats";

type Props = {
  stats: StatsView;
  currentValue: Decimal;
  hasMissingPrices: boolean;
};

export function AchievementRecords({
  stats,
  currentValue,
  hasMissingPrices,
}: Props) {
  const { baseCurrency, allTimeHigh, bestDay, worstDay } = stats;

  const cards: Array<{
    label: string;
    value: string;
    sub?: string;
    hint?: string;
    distance?: string;
    tone: "gain" | "loss" | "neutral";
    icon?: React.ReactNode;
    contributors?: DayContributor[];
  }> = [];

  if (allTimeHigh) {
    const gap = allTimeHigh.value.minus(currentValue).toDecimalPlaces(2);
    const percentage = allTimeHigh.value.gt(0)
      ? ` (${formatPercent(gap.abs().dividedBy(allTimeHigh.value), { signed: false })})`
      : "";
    cards.push({
      label: "All-time high",
      value: formatCurrency(allTimeHigh.value, baseCurrency),
      hint: formatDate(allTimeHigh.date),
      distance: hasMissingPrices
        ? "Distance unavailable — missing prices"
        : gap.isZero()
          ? "Currently at all-time high"
          : `${formatCurrency(gap.abs(), baseCurrency)}${percentage} ${gap.gt(0) ? "below" : "above"} ATH`,
      tone: "gain",
      icon: (
        <Trophy className="h-4 w-4 text-[var(--warning)]" strokeWidth={1.5} />
      ),
    });
  }

  if (bestDay) {
    cards.push({
      label: "Best single day",
      value: formatCurrency(bestDay.changeBase, baseCurrency, { signed: true }),
      sub: formatPercent(bestDay.changePercent.dividedBy(100), {
        signed: true,
      }),
      hint: formatDate(bestDay.date),
      tone: "gain",
      icon: <ArrowUpRight className="h-4 w-4 text-gain" strokeWidth={1.5} />,
      contributors: bestDay.contributors,
    });
  }

  if (worstDay) {
    cards.push({
      label: "Worst single day",
      value: formatCurrency(worstDay.changeBase, baseCurrency, {
        signed: true,
      }),
      sub: formatPercent(worstDay.changePercent.dividedBy(100), {
        signed: true,
      }),
      hint: formatDate(worstDay.date),
      tone: "loss",
      icon: <ArrowDownRight className="h-4 w-4 text-loss" strokeWidth={1.5} />,
      contributors: worstDay.contributors,
    });
  }

  if (cards.length === 0) {
    return (
      <p className="text-sm text-muted">
        No history yet. Run the price cron to start tracking records.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {cards.map((card) => (
        <div key={card.label} className="hairline bg-surface p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="label">{card.label}</p>
            {card.icon}
          </div>
          <p className="display tabular mt-3 text-3xl text-foreground">
            {card.value}
          </p>
          {card.sub ? (
            <p
              className={`tabular mt-1 text-sm ${
                card.tone === "gain"
                  ? "text-gain"
                  : card.tone === "loss"
                    ? "text-loss"
                    : "text-muted"
              }`}
            >
              {card.sub}
            </p>
          ) : null}
          {card.hint ? (
            <p className="mt-2 text-xs text-subtle">{card.hint}</p>
          ) : null}
          {card.distance ? (
            <div className="mt-4 border-t border-border pt-3">
              <p className="label text-[0.65rem]">Current distance</p>
              <p className="tabular mt-2 text-sm text-foreground">
                {card.distance}
              </p>
            </div>
          ) : null}
          {card.contributors && card.contributors.length > 0 ? (
            <ContributionList
              contributors={card.contributors.slice(0, 3)}
              currency={baseCurrency}
              tone={card.tone}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ContributionList({
  contributors,
  currency,
  tone,
}: {
  contributors: DayContributor[];
  currency: string;
  tone: "gain" | "loss" | "neutral";
}) {
  const toneClass =
    tone === "gain"
      ? "text-gain"
      : tone === "loss"
        ? "text-loss"
        : "text-muted";

  return (
    <div className="mt-4 border-t border-border pt-3">
      <p className="label text-[0.65rem]">Top contributors</p>
      <ul className="mt-2 space-y-2">
        {contributors.map((contributor) => (
          <li
            key={contributor.instrumentId}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3"
          >
            <Link
              href={`/stocks/${encodeURIComponent(contributor.symbol)}`}
              className="min-w-0 text-xs text-foreground hover:text-accent"
            >
              <span className="tabular font-medium">{contributor.symbol}</span>
              <span className="ml-2 text-subtle">
                {contributor.sharePercent
                  ? formatPercent(contributor.sharePercent.dividedBy(100), {
                      decimals: 0,
                      signed: false,
                    })
                  : null}
              </span>
            </Link>
            <div className="text-right">
              <p className={`tabular text-xs ${toneClass}`}>
                {formatCurrency(contributor.contributionBase, currency, {
                  compact: true,
                  signed: true,
                })}
              </p>
              {contributor.changePercent ? (
                <p className="tabular text-[0.65rem] text-subtle">
                  {formatPercent(contributor.changePercent.dividedBy(100), {
                    signed: true,
                  })}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

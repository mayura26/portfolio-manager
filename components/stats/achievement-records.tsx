import { ArrowDownRight, ArrowUpRight, Trophy } from "lucide-react";
import type { PortfolioStats } from "@/lib/stats";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";

type Props = { stats: PortfolioStats };

export function AchievementRecords({ stats }: Props) {
  const { baseCurrency, allTimeHigh, bestDay, worstDay } = stats;

  const cards: Array<{
    label: string;
    value: string;
    sub?: string;
    hint?: string;
    tone: "gain" | "loss" | "neutral";
    icon?: React.ReactNode;
  }> = [];

  if (allTimeHigh) {
    cards.push({
      label: "All-time high",
      value: formatCurrency(allTimeHigh.value, baseCurrency),
      hint: formatDate(allTimeHigh.date),
      tone: "gain",
      icon: <Trophy className="h-4 w-4 text-[var(--warning)]" strokeWidth={1.5} />,
    });
  }

  if (bestDay) {
    cards.push({
      label: "Best single day",
      value: formatCurrency(bestDay.changeBase, baseCurrency, { signed: true }),
      sub: formatPercent(bestDay.changePercent.dividedBy(100), { signed: true }),
      hint: formatDate(bestDay.date),
      tone: "gain",
      icon: <ArrowUpRight className="h-4 w-4 text-gain" strokeWidth={1.5} />,
    });
  }

  if (worstDay) {
    cards.push({
      label: "Worst single day",
      value: formatCurrency(worstDay.changeBase, baseCurrency, { signed: true }),
      sub: formatPercent(worstDay.changePercent.dividedBy(100), { signed: true }),
      hint: formatDate(worstDay.date),
      tone: "loss",
      icon: <ArrowDownRight className="h-4 w-4 text-loss" strokeWidth={1.5} />,
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
        </div>
      ))}
    </div>
  );
}

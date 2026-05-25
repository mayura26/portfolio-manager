import type { PortfolioStats } from "@/lib/stats";

type Props = { stats: PortfolioStats };

function pluralDays(n: number): string {
  return n === 1 ? "1 day" : `${n.toLocaleString()} days`;
}

function pluralTrades(n: number): string {
  return n === 1 ? "1 trade" : `${n.toLocaleString()} trades`;
}

export function ActivityPanel({ stats }: Props) {
  const { activity } = stats;

  const items: Array<{ label: string; value: string; sub?: string }> = [
    {
      label: "Trades placed",
      value: pluralTrades(activity.totalTrades),
    },
    {
      label: "Unique instruments",
      value:
        activity.uniqueInstruments === 1
          ? "1 stock"
          : `${activity.uniqueInstruments} stocks`,
      sub: "ever traded or held",
    },
    ...(activity.longestHoldingDays !== null && activity.longestHoldingSymbol
      ? [
          {
            label: "Longest current holding",
            value: pluralDays(activity.longestHoldingDays),
            sub: activity.longestHoldingSymbol,
          },
        ]
      : []),
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="hairline bg-surface p-5">
          <p className="label">{item.label}</p>
          <p className="display tabular mt-3 text-3xl text-foreground">
            {item.value}
          </p>
          {item.sub ? (
            <p className="mt-1 text-xs text-subtle">{item.sub}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

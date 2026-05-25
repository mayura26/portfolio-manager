import {
  ArrowDownRight,
  ArrowUpRight,
  DollarSign,
  Percent,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import type { PositionStat, PortfolioStats } from "@/lib/stats";
import { formatCurrency, formatPercent } from "@/lib/format";

type Props = { stats: PortfolioStats };

type RecordRow = {
  label: string;
  stat: PositionStat;
  primaryValue: string;
  secondaryValue?: string;
  tone: "gain" | "loss";
  icon: React.ReactNode;
};

export function PositionRecords({ stats }: Props) {
  const { baseCurrency } = stats;

  const rows: RecordRow[] = [];

  if (stats.bestUnrealizedAbs) {
    rows.push({
      label: "Biggest unrealized gain ($)",
      stat: stats.bestUnrealizedAbs,
      primaryValue: formatCurrency(stats.bestUnrealizedAbs.value, baseCurrency, {
        signed: true,
      }),
      secondaryValue: stats.bestUnrealizedAbs.percent
        ? formatPercent(stats.bestUnrealizedAbs.percent.dividedBy(100), {
            signed: true,
          })
        : undefined,
      tone: "gain",
      icon: <DollarSign className="h-4 w-4" strokeWidth={1.5} />,
    });
  }

  if (stats.bestUnrealizedPct) {
    rows.push({
      label: "Biggest unrealized gain (%)",
      stat: stats.bestUnrealizedPct,
      primaryValue: stats.bestUnrealizedPct.percent
        ? formatPercent(stats.bestUnrealizedPct.percent.dividedBy(100), {
            signed: true,
          })
        : "—",
      secondaryValue: formatCurrency(stats.bestUnrealizedPct.value, baseCurrency, {
        signed: true,
        compact: true,
      }),
      tone: "gain",
      icon: <Percent className="h-4 w-4" strokeWidth={1.5} />,
    });
  }

  if (stats.bestRealizedAbs) {
    rows.push({
      label: "Best realized gain ($)",
      stat: stats.bestRealizedAbs,
      primaryValue: formatCurrency(stats.bestRealizedAbs.value, baseCurrency, {
        signed: true,
      }),
      tone: "gain",
      icon: <TrendingUp className="h-4 w-4" strokeWidth={1.5} />,
    });
  }

  if (stats.worstPositionAbs) {
    rows.push({
      label: "Biggest unrealized loss ($)",
      stat: stats.worstPositionAbs,
      primaryValue: formatCurrency(stats.worstPositionAbs.value, baseCurrency, {
        signed: true,
      }),
      secondaryValue: stats.worstPositionAbs.percent
        ? formatPercent(stats.worstPositionAbs.percent.dividedBy(100), {
            signed: true,
          })
        : undefined,
      tone: "loss",
      icon: <TrendingDown className="h-4 w-4" strokeWidth={1.5} />,
    });
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted">
        No positions yet. Add trades to see your best and worst performers.
      </p>
    );
  }

  return (
    <ul className="hairline divide-y divide-border bg-surface-elevated">
      {rows.map((row) => (
        <li
          key={row.label}
          className="flex items-center gap-4 px-5 py-4"
        >
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center ${
              row.tone === "gain"
                ? "bg-[color-mix(in_srgb,var(--gain)_12%,transparent)] text-gain"
                : "bg-[color-mix(in_srgb,var(--loss)_12%,transparent)] text-loss"
            }`}
          >
            {row.icon}
          </div>

          <div className="min-w-0 flex-1">
            <p className="label">{row.label}</p>
            <Link
              href={`/stocks/${encodeURIComponent(row.stat.symbol)}`}
              className="mt-0.5 text-sm text-foreground hover:text-accent"
            >
              <span className="tabular font-medium">{row.stat.symbol}</span>
              <span className="ml-2 text-muted">{row.stat.name}</span>
            </Link>
          </div>

          <div className="shrink-0 text-right">
            <p
              className={`display tabular text-xl ${
                row.tone === "gain" ? "text-gain" : "text-loss"
              }`}
            >
              {row.primaryValue}
            </p>
            {row.secondaryValue ? (
              <p className="tabular text-xs text-subtle">{row.secondaryValue}</p>
            ) : null}
          </div>

          <div className={`shrink-0 ${row.tone === "gain" ? "text-gain" : "text-loss"}`}>
            {row.tone === "gain" ? (
              <ArrowUpRight className="h-5 w-5" strokeWidth={1.5} />
            ) : (
              <ArrowDownRight className="h-5 w-5" strokeWidth={1.5} />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

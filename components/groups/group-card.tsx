import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Sparkline } from "@/components/shared/sparkline";
import type { GroupCardSummary } from "@/lib/dashboard";
import {
  formatCurrency,
  formatPercent,
  formatRelative,
  pnlClass,
} from "@/lib/format";

type Props = {
  group: {
    id: string;
    name: string;
    description: string | null;
    baseCurrency: string;
    updatedAt: Date;
    portfolios: { id: string }[];
    summary?: GroupCardSummary;
  };
};

export function GroupCard({ group }: Props) {
  const s = group.summary;
  const hasMetrics = !!s && s.totalValueBase.gt(0);
  const sparkTone: "gain" | "loss" | "neutral" =
    s && s.spark.length >= 2
      ? s.spark[s.spark.length - 1] >= s.spark[0]
        ? "gain"
        : "loss"
      : "neutral";

  return (
    <Link
      href={`/groups/${group.id}`}
      className="group hairline flex min-h-44 flex-col gap-4 bg-surface p-5 transition-colors hover:border-border-strong"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="display truncate text-xl text-foreground">
            {group.name}
          </h3>
          {group.description ? (
            <p className="mt-1 line-clamp-2 text-sm text-muted">
              {group.description}
            </p>
          ) : null}
        </div>
        {s?.unrealizedPercent && !s.unrealizedPercent.isZero() ? (
          <span
            className={`tabular shrink-0 text-xs ${pnlClass(s.unrealizedPercent)}`}
            title="Lifetime unrealized PNL"
          >
            {formatPercent(s.unrealizedPercent.dividedBy(100), {
              signed: true,
              decimals: 1,
            })}
          </span>
        ) : (
          <ArrowUpRight
            className="h-4 w-4 shrink-0 text-subtle transition-colors group-hover:text-accent"
            strokeWidth={1.5}
            aria-hidden
          />
        )}
      </div>

      {hasMetrics ? (
        <div className="min-w-0">
          <p className="display tabular truncate text-2xl text-foreground">
            {formatCurrency(s.totalValueBase, group.baseCurrency)}
            {s.hasMissingPrices ? (
              <span
                className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-warning align-middle"
                title="Some prices missing"
                aria-hidden
              />
            ) : null}
          </p>
          <div className="mt-1.5 flex items-baseline justify-between gap-2 text-xs">
            <span className="label">{group.baseCurrency}</span>
            {s.dailyChange ? (
              <span
                className={`tabular flex items-center gap-1 ${pnlClass(s.dailyChange)}`}
              >
                {s.dailyChange.isPositive() ? (
                  <ArrowUpRight
                    className="h-3 w-3"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                ) : s.dailyChange.isNegative() ? (
                  <ArrowDownRight
                    className="h-3 w-3"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                ) : null}
                <span>
                  {formatCurrency(s.dailyChange, group.baseCurrency, {
                    signed: true,
                  })}
                </span>
                {s.dailyChangePercent ? (
                  <>
                    <span className="text-subtle">·</span>
                    <span>
                      {formatPercent(s.dailyChangePercent.dividedBy(100), {
                        signed: true,
                      })}
                    </span>
                  </>
                ) : null}
              </span>
            ) : (
              <span className="text-subtle">—</span>
            )}
          </div>
        </div>
      ) : null}

      {hasMetrics && s.spark.length >= 2 ? (
        <Sparkline
          values={s.spark}
          tone={sparkTone}
          height={32}
          ariaLabel="30-day value trend"
        />
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted">
        <span className="label truncate">
          {group.portfolios.length} portfolio
          {group.portfolios.length === 1 ? "" : "s"} · {group.baseCurrency}
          {s?.pureCashBase.gt(0) && s.cashPercent?.gt(0)
            ? ` · cash ${formatPercent(
                s.pureCashBase.dividedBy(s.totalValueBase),
                {
                  signed: false,
                  decimals: 0,
                },
              )}`
            : ""}
          {s?.cashInvestmentPercent?.gt(0)
            ? ` · HISA ${formatPercent(s.cashInvestmentPercent.dividedBy(100), {
                signed: false,
                decimals: 0,
              })}`
            : ""}
        </span>
        <span className="shrink-0">
          Updated {formatRelative(group.updatedAt)}
        </span>
      </div>
    </Link>
  );
}

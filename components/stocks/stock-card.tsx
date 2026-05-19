import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import {
  formatCurrency,
  formatPercent,
  formatQuantity,
  pnlClass,
} from "@/lib/format";

export type StockCardContext = {
  hasTrade: boolean;
  hasTarget: boolean;
  hasWatchlist: boolean;
  hasAlert: boolean;
  hasReview: boolean;
  position: {
    quantity: string;
    marketValueBase: string | null;
    unrealizedPnL: string | null;
    unrealizedPnLPercent: string | null;
    baseCurrency: string;
  } | null;
  targetPercent: string | null;
  buyTargets: {
    source: "watchlist" | "portfolio" | "alert";
    low: string | null;
    high: string | null;
    price: string | null;
    currency: string;
  }[];
  priceInfo: {
    currentPrice: string;
    changes: {
      label: string;
      formatted: string | null;
      raw: number | null;
    }[];
  } | null;
  autoWatcher: boolean;
};

type Props = {
  instrument: {
    yahooSymbol: string;
    symbol: string;
    name: string;
    currency: string;
    exchange: string;
    sector: string | null;
  };
  context?: StockCardContext;
};

export function StockCard({ instrument, context }: Props) {
  const badges = getBadges(context);

  return (
    <Link
      href={`/stocks/${encodeURIComponent(instrument.yahooSymbol)}`}
      className="group hairline flex min-h-40 flex-col gap-3 bg-surface p-5 transition-colors hover:border-border-strong"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="display tabular text-xl text-foreground">
            {instrument.symbol}
          </p>
          <p className="mt-1 line-clamp-2 text-sm text-muted">
            {instrument.name}
          </p>
        </div>
        <ArrowUpRight
          className="h-4 w-4 shrink-0 text-subtle transition-colors group-hover:text-accent"
          strokeWidth={1.5}
          aria-hidden
        />
      </div>

      {context?.priceInfo ? <PriceInfoRow info={context.priceInfo} /> : null}

      {badges.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {badges.map((badge) => (
            <span
              key={badge.label}
              className={`label border px-2 py-1 text-[10px] ${badge.className}`}
            >
              {badge.label}
            </span>
          ))}
        </div>
      ) : null}

      {context?.position ? <PositionMetrics context={context} /> : null}

      {context?.buyTargets.length ? (
        <BuyTargetDetails targets={context.buyTargets} />
      ) : null}

      <div className="mt-auto flex items-center justify-between border-t border-border pt-3 text-xs text-muted">
        <span className="label">
          {instrument.exchange} - {instrument.currency}
        </span>
        {instrument.sector ? (
          <span className="truncate">{instrument.sector}</span>
        ) : null}
      </div>
    </Link>
  );
}

function getBadges(context: StockCardContext | undefined) {
  if (!context) return [];

  return [
    context.autoWatcher
      ? {
          label: "AutoWatcher ◉",
          className: "border-accent/40 bg-accent/10 text-accent",
        }
      : null,
    context.position
      ? {
          label: "Held",
          className: "border-gain/40 bg-gain/10 text-gain",
        }
      : null,
    !context.position && context.hasTrade
      ? {
          label: "Traded",
          className: "border-border bg-surface-elevated text-muted",
        }
      : null,
    context.buyTargets.length > 0
      ? {
          label: "Buy target",
          className: "border-accent/40 bg-accent/10 text-accent",
        }
      : null,
    context.hasTarget
      ? {
          label: context.targetPercent
            ? `Target ${formatPercent(Number(context.targetPercent) / 100, {
                decimals: 2,
                signed: false,
              })}`
            : "Target",
          className: "border-border bg-surface-elevated text-muted",
        }
      : null,
    context.hasWatchlist
      ? {
          label: "Watchlist",
          className: "border-border bg-surface-elevated text-muted",
        }
      : null,
    context.hasAlert
      ? {
          label: "Alert",
          className: "border-border bg-surface-elevated text-muted",
        }
      : null,
    context.hasReview
      ? {
          label: "Review",
          className: "border-border bg-surface-elevated text-muted",
        }
      : null,
  ].filter((badge): badge is { label: string; className: string } =>
    Boolean(badge),
  );
}

function PriceInfoRow({
  info,
}: {
  info: NonNullable<StockCardContext["priceInfo"]>;
}) {
  const day = info.changes[0];

  return (
    <div className="flex flex-col gap-1.5 border-t border-border pt-3">
      {/* Current price + day change */}
      <div className="flex items-baseline gap-2">
        <span className="tabular text-lg text-foreground">
          {info.currentPrice}
        </span>
        {day && day.formatted !== null && day.raw !== null ? (
          <span className={`tabular text-xs font-medium ${pnlClass(day.raw)}`}>
            {day.formatted}
          </span>
        ) : (
          <span className="text-xs text-subtle">—</span>
        )}
      </div>

      {/* Period change pills */}
      <div className="flex items-center gap-3">
        {info.changes.map((c) => (
          <span key={c.label} className="flex items-center gap-1">
            <span className="label text-[10px] text-subtle">{c.label}</span>
            <span
              className={`tabular text-[10px] font-medium ${
                c.raw !== null ? pnlClass(c.raw) : "text-subtle"
              }`}
            >
              {c.formatted ?? "—"}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function PositionMetrics({ context }: { context: StockCardContext }) {
  const position = context.position;
  if (!position) return null;

  return (
    <div className="grid grid-cols-3 gap-3 border-t border-border pt-3 text-xs">
      <Metric label="Qty" value={formatQuantity(position.quantity)} />
      <Metric
        label="Value"
        value={
          position.marketValueBase
            ? formatCurrency(position.marketValueBase, position.baseCurrency, {
                compact: true,
              })
            : "-"
        }
      />
      <Metric
        label="Unrealized"
        value={
          position.unrealizedPnL
            ? formatCurrency(position.unrealizedPnL, position.baseCurrency, {
                compact: true,
                signed: true,
              })
            : "-"
        }
        detail={
          position.unrealizedPnLPercent
            ? formatPercent(position.unrealizedPnLPercent, {
                decimals: 1,
                signed: true,
              })
            : null
        }
        valueClassName={
          position.unrealizedPnL ? pnlClass(position.unrealizedPnL) : undefined
        }
      />
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  valueClassName = "text-foreground",
}: {
  label: string;
  value: string;
  detail?: string | null;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="label text-[10px] text-subtle">{label}</p>
      <p className={`tabular truncate ${valueClassName}`}>{value}</p>
      {detail ? <p className="tabular truncate text-subtle">{detail}</p> : null}
    </div>
  );
}

function BuyTargetDetails({
  targets,
}: {
  targets: StockCardContext["buyTargets"];
}) {
  return (
    <div className="flex flex-col gap-1 border-t border-border pt-3 text-xs">
      {targets.map((target, index) => (
        <div
          key={`${target.source}-${index}`}
          className="flex items-center justify-between gap-3"
        >
          <span className="label text-[10px] text-subtle">
            {target.source === "watchlist"
              ? "Buy zone"
              : target.source === "portfolio"
                ? "Buy price"
                : "Buy alert"}
          </span>
          <span className="tabular truncate text-muted">
            {formatBuyTarget(target)}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatBuyTarget(target: StockCardContext["buyTargets"][number]) {
  if (target.source === "watchlist") {
    if (target.low && target.high) {
      return `${formatCurrency(target.low, target.currency)} - ${formatCurrency(
        target.high,
        target.currency,
      )}`;
    }
    if (target.high) {
      return `up to ${formatCurrency(target.high, target.currency)}`;
    }
    if (target.low) {
      return `from ${formatCurrency(target.low, target.currency)}`;
    }
  }

  if (target.price) {
    return formatCurrency(target.price, target.currency);
  }

  return "-";
}

import Link from "next/link";
import { formatRelative } from "@/lib/format";
import { AlertActions } from "./alert-actions";
import { AlertStatusBadge } from "./alert-status-badge";

type AlertRow = {
  id: string;
  type: string;
  status: "ACTIVE" | "TRIGGERED" | "SNOOZED" | "DISMISSED";
  priceTarget: { toString: () => string } | null;
  priceDirection: string | null;
  pctChange: { toString: () => string } | null;
  reviewIntervalDays: number | null;
  allocationThreshold: { toString: () => string } | null;
  message: string | null;
  triggeredAt: Date | null;
  createdAt: Date;
  snoozedUntil: Date | null;
  instrument: { yahooSymbol: string; symbol: string; name: string } | null;
  portfolio: { id: string; name: string } | null;
};

type Props = {
  alert: AlertRow;
};

const TYPE_LABELS: Record<string, string> = {
  PRICE_ABOVE: "Price above",
  PRICE_BELOW: "Price below",
  PCT_CHANGE: "Percent move",
  REVIEW_TIMER: "Review timer",
  ALLOCATION_DRIFT: "Allocation drift",
  DIVIDEND_EVENT: "Dividend event",
  EARNINGS_EVENT: "Earnings event",
};

export function AlertCard({ alert }: Props) {
  return (
    <article className="hairline flex flex-col gap-3 bg-surface-elevated p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="label">{TYPE_LABELS[alert.type] ?? alert.type}</p>
            <AlertStatusBadge status={alert.status} />
          </div>
          <h3 className="mt-2 text-base text-foreground">
            {alert.instrument ? (
              <Link
                href={`/stocks/${encodeURIComponent(alert.instrument.yahooSymbol)}`}
                className="hover:text-accent"
              >
                <span className="tabular font-medium">
                  {alert.instrument.symbol}
                </span>{" "}
                <span className="text-muted">{alert.instrument.name}</span>
              </Link>
            ) : alert.portfolio ? (
              <Link
                href={`/portfolios/${alert.portfolio.id}`}
                className="hover:text-accent"
              >
                {alert.portfolio.name}
              </Link>
            ) : (
              <span className="text-muted">Global</span>
            )}
          </h3>
          <p className="mt-1 text-sm text-muted">{describeCondition(alert)}</p>
          {alert.message ? (
            <p className="mt-2 text-sm italic text-subtle">"{alert.message}"</p>
          ) : null}
        </div>
        <AlertActions alertId={alert.id} status={alert.status} />
      </div>

      <div className="flex items-center justify-between border-t border-border pt-2 text-xs text-muted">
        <span>
          {alert.triggeredAt
            ? `Triggered ${formatRelative(alert.triggeredAt)}`
            : alert.snoozedUntil && alert.status === "SNOOZED"
              ? `Snoozed until ${alert.snoozedUntil.toLocaleString()}`
              : `Created ${formatRelative(alert.createdAt)}`}
        </span>
      </div>
    </article>
  );
}

function describeCondition(alert: AlertRow): string {
  switch (alert.type) {
    case "PRICE_ABOVE":
      return alert.priceTarget
        ? `When price rises above ${alert.priceTarget.toString()}.`
        : "Price target not set.";
    case "PRICE_BELOW":
      return alert.priceTarget
        ? `When price falls below ${alert.priceTarget.toString()}.`
        : "Price target not set.";
    case "PCT_CHANGE":
      return alert.pctChange
        ? `When price moves ±${alert.pctChange.toString()}% from reference.`
        : "Threshold not set.";
    case "REVIEW_TIMER":
      return alert.reviewIntervalDays
        ? `Every ${alert.reviewIntervalDays} day${alert.reviewIntervalDays === 1 ? "" : "s"}.`
        : "Interval not set.";
    case "ALLOCATION_DRIFT":
      return alert.allocationThreshold
        ? `When allocation drifts ±${alert.allocationThreshold.toString()}% from target.`
        : "Threshold not set.";
    default:
      return "";
  }
}

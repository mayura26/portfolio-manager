import { formatCurrency, formatPercent, formatRelative } from "@/lib/format";
import { PinForecastButton } from "./pin-forecast-button";

type Forecast = {
  id: string;
  source: "AI" | "USER";
  isPinned: boolean;
  targetPrice: { toString(): string };
  lowCase: { toString(): string } | null;
  highCase: { toString(): string } | null;
  expectedReturn: { toString(): string } | null;
  horizonMonths: number;
  rationale: string;
  generatedAt: Date;
  model: string;
  streetTargetMean?: { toString(): string } | null;
};

type Props = {
  forecast: Forecast | null;
  currency: string;
  emptyText?: string;
};

export function ForecastCard({ forecast, currency, emptyText }: Props) {
  if (!forecast) {
    return (
      <div className="hairline bg-surface px-5 py-6 text-sm text-muted">
        {emptyText ?? "No forecast yet. Click Generate forecast to create one."}
      </div>
    );
  }

  return (
    <div className="hairline flex flex-col gap-4 bg-surface px-5 py-5">
      <div className="flex flex-wrap items-center gap-2">
        <SourceBadge source={forecast.source} isPinned={forecast.isPinned} />
        <PinForecastButton
          forecastId={forecast.id}
          isPinned={forecast.isPinned}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat
          label={`Target (${forecast.horizonMonths}m)`}
          value={formatCurrency(forecast.targetPrice.toString(), currency)}
        />
        <Stat
          label="Bear case"
          value={
            forecast.lowCase
              ? formatCurrency(forecast.lowCase.toString(), currency)
              : "—"
          }
          tone="text-loss"
        />
        <Stat
          label="Bull case"
          value={
            forecast.highCase
              ? formatCurrency(forecast.highCase.toString(), currency)
              : "—"
          }
          tone="text-gain"
        />
        <Stat
          label="Expected return"
          value={
            forecast.expectedReturn
              ? formatPercent(
                  Number(forecast.expectedReturn.toString()) / 100,
                  { signed: true },
                )
              : "—"
          }
        />
      </div>

      {forecast.streetTargetMean ? (
        <p className="text-xs text-subtle">
          Street consensus:&nbsp;
          <span className="tabular text-foreground">
            {formatCurrency(forecast.streetTargetMean.toString(), currency)}
          </span>
        </p>
      ) : null}

      <p className="text-sm text-foreground">{forecast.rationale}</p>

      <p className="text-xs text-subtle">
        Generated {formatRelative(forecast.generatedAt)} · model{" "}
        {forecast.model}
      </p>
    </div>
  );
}

function SourceBadge({
  source,
  isPinned,
}: {
  source: "AI" | "USER";
  isPinned: boolean;
}) {
  const label =
    source === "USER" ? (isPinned ? "Yours (pinned)" : "Yours") : "AI";
  const tone =
    source === "USER"
      ? "bg-accent text-accent-foreground"
      : "bg-surface-elevated text-muted";
  return (
    <span className={`hairline px-2 py-0.5 text-xs ${tone}`}>{label}</span>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className={`tabular mt-1 text-base ${tone ?? "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}

import { formatCurrency, formatPercent, formatRelative } from "@/lib/format";

type Forecast = {
  targetPrice: { toString(): string };
  lowCase: { toString(): string } | null;
  highCase: { toString(): string } | null;
  expectedReturn: { toString(): string } | null;
  horizonMonths: number;
  rationale: string;
  generatedAt: Date;
  model: string;
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

      <p className="text-sm text-foreground">{forecast.rationale}</p>

      <p className="text-xs text-subtle">
        Generated {formatRelative(forecast.generatedAt)} · model{" "}
        {forecast.model}
      </p>
    </div>
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

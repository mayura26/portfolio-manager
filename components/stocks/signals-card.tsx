import { computeSellSignals, type SellSignal } from "@/lib/signals";

type Props = {
  instrumentId: string;
};

export async function SignalsCard({ instrumentId }: Props) {
  const signals = await computeSellSignals({ instrumentId });
  if (signals.length === 0) return null;

  return (
    <div className="hairline flex flex-col gap-3 bg-surface px-5 py-5">
      <div>
        <h3 className="text-sm font-medium text-foreground">Signals</h3>
        <p className="mt-1 text-xs text-muted">
          Triggered against your active forecast and targets.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {signals.map((s, i) => (
          <li
            key={`${s.kind}-${i}`}
            className="hairline flex items-center justify-between gap-3 bg-surface-elevated px-3 py-2"
          >
            <div className="flex flex-col">
              <span className="text-sm text-foreground">
                {labelFor(s.kind)}
              </span>
              <span className="text-xs text-subtle">{s.reason}</span>
            </div>
            <span className="tabular text-sm text-foreground">
              {s.currency} {s.currentPrice.toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function labelFor(kind: SellSignal["kind"]): string {
  switch (kind) {
    case "TARGET_HIT":
      return "Forecast target hit";
    case "BULL_HIT":
      return "Bull case reached";
    case "STREET_TARGET_HIT":
      return "Street consensus hit";
    case "SELF_SELL_HIT":
      return "Your sell price hit";
    case "GAIN_THRESHOLD":
      return "Gain threshold reached";
    case "BUY_ZONE_HIT":
      return "Your buy zone hit";
    case "APPROACHING_TARGET":
      return "Approaching target";
    case "APPROACHING_BULL":
      return "Approaching bull case";
    case "APPROACHING_SELF_SELL":
      return "Approaching your sell";
    case "APPROACHING_BUY":
      return "Approaching your buy";
  }
}

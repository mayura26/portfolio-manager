import Link from "next/link";
import { computeSellSignals, type SellSignal } from "@/lib/signals";

const LIMIT = 5;

export async function SignalsPanel() {
  const signals = await computeSellSignals();
  const top = signals.slice(0, LIMIT);

  return (
    <div className="hairline flex flex-col gap-3 bg-surface px-5 py-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-foreground">Review queue</h3>
        {signals.length > LIMIT ? (
          <span className="text-xs text-subtle">
            +{signals.length - LIMIT} more
          </span>
        ) : null}
      </div>
      {top.length === 0 ? (
        <p className="text-sm text-muted">
          No positions need review right now.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {top.map((s, i) => (
            <li
              key={`${s.instrumentId}-${s.kind}-${i}`}
              className="flex items-center justify-between gap-3"
            >
              <div className="flex min-w-0 flex-col">
                <Link
                  href={`/stocks/${encodeURIComponent(s.yahooSymbol)}`}
                  className="text-sm text-foreground hover:underline"
                >
                  {s.symbol} — {labelFor(s.kind)}
                </Link>
                <span className="truncate text-xs text-subtle">{s.reason}</span>
              </div>
              <span className="tabular shrink-0 text-sm text-foreground">
                {s.currency} {s.currentPrice.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function labelFor(kind: SellSignal["kind"]): string {
  switch (kind) {
    case "TARGET_HIT":
      return "target hit";
    case "BULL_HIT":
      return "bull case hit";
    case "STREET_TARGET_HIT":
      return "street target hit";
    case "SELF_SELL_HIT":
      return "your sell hit";
    case "GAIN_THRESHOLD":
      return "gain threshold";
    case "BUY_ZONE_HIT":
      return "buy zone hit";
    case "APPROACHING_TARGET":
      return "near target";
    case "APPROACHING_BULL":
      return "near bull case";
    case "APPROACHING_SELF_SELL":
      return "near your sell";
    case "APPROACHING_BUY":
      return "near your buy";
  }
}

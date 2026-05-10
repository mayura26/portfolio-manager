import type { ImportResult } from "@/lib/import/ibkr-engine";

type Props = {
  result: ImportResult;
};

export function ImportResultDisplay({ result }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-6 text-sm">
        <span className="text-gain">
          <strong>{result.inserted}</strong> imported
        </span>
        <span className="text-muted">
          <strong>{result.skipped}</strong> skipped (duplicates)
        </span>
        {result.failed.length > 0 ? (
          <span className="text-loss">
            <strong>{result.failed.length}</strong> failed
          </span>
        ) : null}
      </div>

      {result.failed.length > 0 ? (
        <details className="hairline border-loss/30 bg-loss-soft">
          <summary className="cursor-pointer px-4 py-2 text-sm text-loss">
            {result.failed.length} trade
            {result.failed.length !== 1 ? "s" : ""} could not be imported
          </summary>
          <ul className="flex flex-col divide-y divide-border px-4 pb-3 text-xs text-muted">
            {result.failed.map((f, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static list
              <li key={i} className="py-2">
                <span className="font-mono text-foreground">{f.symbol}</span>
                {" — "}
                {f.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

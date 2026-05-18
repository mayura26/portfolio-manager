type Props = {
  sum?: number;
  minSum?: number;
  maxSum?: number;
  label?: string;
};

export function SumToHundredIndicator({
  sum,
  minSum,
  maxSum,
  label = "Total",
}: Props) {
  if (minSum !== undefined && maxSum !== undefined) {
    const ok = minSum <= 100.0001 && maxSum >= 99.9999;
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="label">{label}</span>
        <span className={`tabular ${ok ? "text-gain" : "text-warning"}`}>
          {minSum.toFixed(2)}%-{maxSum.toFixed(2)}%
        </span>
        {ok ? (
          <span className="text-xs text-gain">100% fits</span>
        ) : (
          <span className="text-xs text-warning">range must include 100%</span>
        )}
      </div>
    );
  }

  const total = sum ?? 0;
  const diff = total - 100;
  const ok = Math.abs(diff) < 0.0001;
  const sign = diff > 0 ? "+" : "";
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="label">{label}</span>
      <span className={`tabular ${ok ? "text-gain" : "text-warning"}`}>
        {total.toFixed(2)}%
      </span>
      {ok ? (
        <span className="text-xs text-gain">in balance</span>
      ) : (
        <span className="text-xs text-warning">
          ({sign}
          {diff.toFixed(2)} from 100%)
        </span>
      )}
    </div>
  );
}

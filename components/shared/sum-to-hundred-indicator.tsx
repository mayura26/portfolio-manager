type Props = {
  sum: number;
  label?: string;
};

export function SumToHundredIndicator({ sum, label = "Total" }: Props) {
  const diff = sum - 100;
  const ok = Math.abs(diff) < 0.0001;
  const sign = diff > 0 ? "+" : "";
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="label">{label}</span>
      <span className={`tabular ${ok ? "text-gain" : "text-warning"}`}>
        {sum.toFixed(2)}%
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

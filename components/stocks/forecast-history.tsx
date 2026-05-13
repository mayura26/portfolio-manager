import { formatCurrency, formatDate, formatPercent } from "@/lib/format";

type Forecast = {
  id: string;
  source: "AI" | "USER";
  isPinned: boolean;
  targetPrice: { toString(): string };
  lowCase: { toString(): string } | null;
  highCase: { toString(): string } | null;
  expectedReturn: { toString(): string } | null;
  horizonMonths: number;
  generatedAt: Date;
  rationale: string;
};

type Props = {
  forecasts: Forecast[];
  currency: string;
};

export function ForecastHistory({ forecasts, currency }: Props) {
  if (forecasts.length === 0) return null;

  return (
    <details className="mt-2">
      <summary className="label cursor-pointer select-none text-xs text-muted hover:text-foreground">
        Forecast history ({forecasts.length})
      </summary>
      <div className="mt-3 hairline overflow-x-auto bg-surface-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="label px-3 py-3">Generated</th>
              <th className="label px-3 py-3">Source</th>
              <th className="label px-3 py-3 text-right">Target</th>
              <th className="label px-3 py-3 text-right">Low</th>
              <th className="label px-3 py-3 text-right">High</th>
              <th className="label px-3 py-3 text-right">Expected return</th>
              <th className="label px-3 py-3 text-right">Horizon</th>
            </tr>
          </thead>
          <tbody>
            {forecasts.map((f) => (
              <tr key={f.id} className="border-b border-border last:border-b-0">
                <td className="px-3 py-3 tabular text-muted">
                  {formatDate(f.generatedAt)}
                </td>
                <td className="px-3 py-3 text-xs">
                  {f.source === "USER" ? "Yours" : "AI"}
                  {f.isPinned ? " · pinned" : ""}
                </td>
                <td className="px-3 py-3 text-right tabular">
                  {formatCurrency(f.targetPrice.toString(), currency)}
                </td>
                <td className="px-3 py-3 text-right tabular text-loss">
                  {f.lowCase
                    ? formatCurrency(f.lowCase.toString(), currency)
                    : "—"}
                </td>
                <td className="px-3 py-3 text-right tabular text-gain">
                  {f.highCase
                    ? formatCurrency(f.highCase.toString(), currency)
                    : "—"}
                </td>
                <td className="px-3 py-3 text-right tabular">
                  {f.expectedReturn
                    ? formatPercent(Number(f.expectedReturn.toString()) / 100, {
                        signed: true,
                      })
                    : "—"}
                </td>
                <td className="px-3 py-3 text-right tabular text-muted">
                  {f.horizonMonths}m
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { getTickerSmartMoney } from "@/lib/trade-signals";

type Props = {
  ticker: string;
};

const SOURCE_LABEL: Record<string, string> = {
  House: "House",
  Senate: "Senate",
  Insider: "Insider",
};

function isBuy(tx: string) {
  return tx === "Purchase";
}
function isSell(tx: string) {
  return tx === "Sale" || tx === "Sale (Partial)";
}

export async function SmartMoneyCard({ ticker }: Props) {
  const trades = await getTickerSmartMoney(ticker);
  if (trades.length === 0) return null;

  return (
    <div className="hairline flex flex-col gap-3 bg-surface px-5 py-5">
      <div>
        <h3 className="text-sm font-medium text-foreground">Smart money</h3>
        <p className="mt-1 text-xs text-muted">
          Recent Congress &amp; corporate-insider disclosures for {ticker}.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {trades.map((t, i) => {
          const tone = isBuy(t.transaction)
            ? "text-gain"
            : isSell(t.transaction)
              ? "text-loss"
              : "text-muted";
          const amount =
            t.rangeRaw ??
            (t.value != null
              ? formatCurrency(t.value, "USD", { compact: true })
              : t.shares != null
                ? `${formatNumber(t.shares, { decimals: 0 })} sh`
                : "—");
          return (
            <li
              key={`${t.source}-${t.actor}-${i}`}
              className="hairline flex items-center justify-between gap-3 bg-surface-elevated px-3 py-2"
            >
              <div className="flex min-w-0 flex-col">
                <span className="flex items-center gap-2 text-sm text-foreground">
                  <span className="label hairline bg-surface px-1.5 py-0.5 text-subtle">
                    {SOURCE_LABEL[t.source]}
                  </span>
                  <span className="truncate">{t.actor}</span>
                </span>
                <span className="mt-0.5 text-xs text-subtle">
                  {[t.detail, formatDate(t.transactionDate)]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <span className={`text-sm ${tone}`}>{t.transaction}</span>
                <span className="tabular text-xs text-muted">{amount}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

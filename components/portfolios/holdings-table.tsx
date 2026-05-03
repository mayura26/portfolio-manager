import Link from "next/link";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatQuantity,
  pnlClass,
} from "@/lib/format";
import type { PortfolioHoldings } from "@/lib/holdings";

type Props = {
  data: PortfolioHoldings;
};

export function HoldingsTable({ data }: Props) {
  const { holdings, baseCurrency } = data;

  return (
    <div className="hairline overflow-x-auto bg-surface-elevated">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <Th>Instrument</Th>
            <Th align="right">Quantity</Th>
            <Th align="right">Avg cost</Th>
            <Th align="right">Last price</Th>
            <Th align="right">Market value</Th>
            <Th align="right">Unrealized</Th>
            <Th align="right">Allocation</Th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => (
            <tr
              key={h.instrumentId}
              className="border-b border-border last:border-b-0"
            >
              <Td>
                <Link
                  href={`/stocks/${h.yahooSymbol}`}
                  className="text-foreground hover:text-accent"
                >
                  <span className="tabular font-medium">{h.symbol}</span>
                  <span className="ml-2 text-muted">{h.name}</span>
                </Link>
                <div className="label mt-0.5">{h.currency}</div>
              </Td>
              <Td align="right">
                <span className="tabular">
                  {formatQuantity(h.quantity.toString())}
                </span>
              </Td>
              <Td align="right">
                <span className="tabular text-muted">
                  {formatCurrency(h.avgCostBase.toString(), baseCurrency)}
                </span>
              </Td>
              <Td align="right">
                <span className="tabular">
                  {h.marketPrice
                    ? formatCurrency(h.marketPrice.toString(), h.currency)
                    : "—"}
                </span>
              </Td>
              <Td align="right">
                <span className="tabular">
                  {h.marketValueBase
                    ? formatCurrency(h.marketValueBase.toString(), baseCurrency)
                    : "—"}
                </span>
              </Td>
              <Td align="right">
                {h.unrealizedPnL ? (
                  <span
                    className={`tabular ${pnlClass(h.unrealizedPnL.toString())}`}
                  >
                    {formatCurrency(h.unrealizedPnL.toString(), baseCurrency, {
                      signed: true,
                    })}
                    {h.unrealizedPnLPercent ? (
                      <span className="ml-1 text-xs text-muted">
                        {formatPercent(
                          h.unrealizedPnLPercent.dividedBy(100).toString(),
                          {
                            signed: true,
                          },
                        )}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="tabular text-subtle">—</span>
                )}
              </Td>
              <Td align="right">
                <span className="tabular text-muted">
                  {h.allocationPercent
                    ? `${formatNumber(h.allocationPercent.toString(), { decimals: 1 })}%`
                    : "—"}
                </span>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`label px-3 py-3 ${align === "right" ? "text-right" : "text-left"}`}
      scope="col"
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className={`px-3 py-3 align-top ${align === "right" ? "text-right" : "text-left"}`}
    >
      {children}
    </td>
  );
}

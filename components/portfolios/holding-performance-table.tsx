import Link from "next/link";
import { formatCurrency, formatNumber, pnlClass } from "@/lib/format";
import type { PortfolioHoldingPerformance } from "@/lib/holding-performance";

type Props = {
  performance: PortfolioHoldingPerformance;
};

export function HoldingPerformanceTable({ performance }: Props) {
  const { rows, baseCurrency } = performance;

  return (
    <div className="hairline overflow-x-auto bg-surface-elevated">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <Th>Holding</Th>
            <Th align="right">PNL %</Th>
            <Th align="right">PNL total</Th>
            <Th align="right">Position size</Th>
            <Th align="right">Last day</Th>
            <Th align="right">Last week</Th>
            <Th align="right">Last month</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={7}
                className="px-3 py-8 text-center text-sm text-muted"
              >
                No open holdings to measure yet.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.instrumentId}
                className="border-b border-border last:border-b-0"
              >
                <Td>
                  <Link
                    href={`/stocks/${row.yahooSymbol}`}
                    className="text-foreground hover:text-accent"
                  >
                    <span className="tabular font-medium">{row.symbol}</span>
                    <span className="ml-2 text-muted">{row.name}</span>
                  </Link>
                  <div className="label mt-0.5 text-subtle">{row.currency}</div>
                </Td>
                <Td align="right">
                  <PercentCell value={row.pnlPercent} />
                </Td>
                <Td align="right">
                  <CurrencyCell
                    value={row.pnlTotalBase}
                    currency={baseCurrency}
                    signed
                  />
                </Td>
                <Td align="right">
                  <CurrencyCell
                    value={row.positionSizeBase}
                    currency={baseCurrency}
                  />
                </Td>
                <Td align="right">
                  <PercentCell value={row.returns.day} />
                </Td>
                <Td align="right">
                  <PercentCell value={row.returns.week} />
                </Td>
                <Td align="right">
                  <PercentCell value={row.returns.month} />
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function PercentCell({ value }: { value: { toString(): string } | null }) {
  if (value === null) {
    return <span className="tabular text-muted">-</span>;
  }
  return (
    <span className={`tabular ${pnlClass(value.toString())}`}>
      {formatNumber(value.toString(), { decimals: 2, signed: true })}%
    </span>
  );
}

function CurrencyCell({
  value,
  currency,
  signed = false,
}: {
  value: { toString(): string } | null;
  currency: string;
  signed?: boolean;
}) {
  if (value === null) {
    return <span className="tabular text-muted">-</span>;
  }
  return (
    <span className={`tabular ${signed ? pnlClass(value.toString()) : ""}`}>
      {formatCurrency(value.toString(), currency, { signed })}
    </span>
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

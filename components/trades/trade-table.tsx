import Link from "next/link";
import { formatCurrency, formatDate, formatQuantity } from "@/lib/format";

type TradeRow = {
  id: string;
  date: Date;
  type: "BUY" | "SELL";
  quantity: { toString: () => string };
  price: { toString: () => string };
  currency: string;
  fees: { toString: () => string };
  fxRate: { toString: () => string } | null;
  instrument: { symbol: string; name: string; yahooSymbol: string };
};

type Props = {
  portfolioId: string;
  trades: TradeRow[];
};

export function TradeTable({ portfolioId, trades }: Props) {
  return (
    <div className="hairline overflow-x-auto bg-surface-elevated">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <Th>Date</Th>
            <Th>Side</Th>
            <Th>Instrument</Th>
            <Th align="right">Quantity</Th>
            <Th align="right">Price</Th>
            <Th align="right">Fees</Th>
            <Th align="right">FX rate</Th>
            <Th align="right">{""}</Th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => (
            <tr key={trade.id} className="border-b border-border last:border-b-0">
              <Td>
                <span className="tabular text-muted">{formatDate(trade.date)}</span>
              </Td>
              <Td>
                <span
                  className={[
                    "label inline-flex items-center px-2 py-0.5",
                    trade.type === "BUY"
                      ? "border border-gain/30 bg-gain-soft text-gain"
                      : "border border-loss/30 bg-loss-soft text-loss",
                  ].join(" ")}
                >
                  {trade.type}
                </span>
              </Td>
              <Td>
                <Link
                  href={`/stocks/${trade.instrument.yahooSymbol}`}
                  className="text-foreground hover:text-accent"
                >
                  <span className="tabular font-medium">{trade.instrument.symbol}</span>{" "}
                  <span className="text-muted">{trade.instrument.name}</span>
                </Link>
              </Td>
              <Td align="right">
                <span className="tabular">{formatQuantity(trade.quantity.toString())}</span>
              </Td>
              <Td align="right">
                <span className="tabular">
                  {formatCurrency(trade.price.toString(), trade.currency)}
                </span>
              </Td>
              <Td align="right">
                <span className="tabular text-muted">
                  {formatCurrency(trade.fees.toString(), trade.currency)}
                </span>
              </Td>
              <Td align="right">
                <span className="tabular text-muted">
                  {trade.fxRate ? Number(trade.fxRate.toString()).toFixed(4) : "—"}
                </span>
              </Td>
              <Td align="right">
                <Link
                  href={`/portfolios/${portfolioId}/trades/${trade.id}`}
                  className="text-xs text-accent hover:underline"
                >
                  Edit
                </Link>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
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
    <td className={`px-3 py-3 ${align === "right" ? "text-right" : "text-left"}`}>{children}</td>
  );
}

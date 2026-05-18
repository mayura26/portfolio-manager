import Link from "next/link";
import { formatCurrency, formatNumber, formatQuantity } from "@/lib/format";
import type { PortfolioAllocation } from "@/lib/portfolio-allocation";
import { BuyPlanCell } from "./buy-plan-cell";

type Props = {
  allocation: PortfolioAllocation;
  groupCashBase: string;
  groupBaseCurrency: string;
};

export function AllocationTable({
  allocation,
  groupCashBase,
  groupBaseCurrency,
}: Props) {
  const { rows, baseCurrency, totalMarketValueBase } = allocation;

  return (
    <div className="hairline overflow-x-auto bg-surface-elevated">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <Th>Instrument</Th>
            <Th align="right">Quantity</Th>
            <Th align="right">Market value</Th>
            <Th align="right">Target range</Th>
            <Th align="right">Actual %</Th>
            <Th align="right">Drift</Th>
            <Th align="right">Buy plan</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={7}
                className="px-3 py-8 text-center text-sm text-muted"
              >
                No holdings or targets yet.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr
                key={r.instrumentId}
                className="border-b border-border last:border-b-0"
              >
                <Td>
                  <Link
                    href={`/stocks/${r.yahooSymbol}`}
                    className="text-foreground hover:text-accent"
                  >
                    <span className="tabular font-medium">{r.symbol}</span>
                    <span className="ml-2 text-muted">{r.name}</span>
                  </Link>
                  <div className="label mt-0.5 text-subtle">
                    {r.currency}
                    {!r.isHeld ? " - target only" : ""}
                  </div>
                </Td>
                <Td align="right">
                  <span className="tabular">
                    {r.isHeld ? formatQuantity(r.quantity.toString()) : "-"}
                  </span>
                </Td>
                <Td align="right">
                  <span className="tabular">
                    {r.isHeld
                      ? formatCurrency(
                          r.marketValueBase.toString(),
                          baseCurrency,
                        )
                      : "-"}
                  </span>
                </Td>
                <Td align="right">
                  <span className="tabular text-muted">
                    {r.hasTarget
                      ? formatTargetRange(
                          r.targetMinPercent.toString(),
                          r.targetMaxPercent.toString(),
                        )
                      : "-"}
                  </span>
                </Td>
                <Td align="right">
                  <span className="tabular">
                    {formatNumber(r.actualPercent.toString(), { decimals: 2 })}%
                  </span>
                </Td>
                <Td align="right">
                  <DriftCell
                    drift={Number(r.driftPercent.toString())}
                    status={r.rangeStatus}
                  />
                </Td>
                <Td align="right">
                  {r.hasTarget ? (
                    <BuyPlanCell
                      row={{
                        targetPercent: r.targetPercent.toString(),
                        rebalanceTargetPercent:
                          r.rebalanceTargetPercent.toString(),
                        rangeStatus: r.rangeStatus,
                        marketValueBase: r.marketValueBase.toString(),
                        intendedBuyPrice:
                          r.intendedBuyPrice?.toString() ?? null,
                      }}
                      totalPortfolioValueBase={totalMarketValueBase.toString()}
                      portfolioBaseCurrency={baseCurrency}
                      groupCashBase={groupCashBase}
                      groupBaseCurrency={groupBaseCurrency}
                    />
                  ) : (
                    <span className="text-xs text-subtle">no target</span>
                  )}
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function formatTargetRange(min: string, max: string) {
  if (Math.abs(Number(min) - Number(max)) < 0.0001) {
    return `${formatNumber(min, { decimals: 2 })}%`;
  }
  return `${formatNumber(min, { decimals: 2 })}-${formatNumber(max, {
    decimals: 2,
  })}%`;
}

function DriftCell({
  drift,
  status,
}: {
  drift: number;
  status: "on-target" | "underweight" | "overweight";
}) {
  if (status === "on-target" || Math.abs(drift) < 0.005) {
    return <span className="tabular text-muted">in range</span>;
  }
  const tone =
    status === "overweight"
      ? Math.abs(drift) >= 5
        ? "text-overweight-strong"
        : "text-overweight"
      : Math.abs(drift) >= 5
        ? "text-loss"
        : "text-warning";
  const sign = drift > 0 ? "+" : "";
  return (
    <span className={`tabular ${tone}`}>
      {sign}
      {drift.toFixed(2)}%
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

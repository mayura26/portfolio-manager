import Link from "next/link";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { GroupAllocation } from "@/lib/group-allocation";

type Props = {
  allocation: GroupAllocation;
};

export function GroupAllocationTable({ allocation }: Props) {
  const { rows, baseCurrency } = allocation;

  return (
    <div className="hairline overflow-x-auto bg-surface-elevated">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <Th>Holding</Th>
            <Th align="right">Target range</Th>
            <Th align="right">Actual %</Th>
            <Th align="right">Drift</Th>
            <Th align="right">Value</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={
                r.kind === "portfolio"
                  ? r.portfolioId
                  : r.kind === "cash"
                    ? "cash"
                    : "cash-investment"
              }
              className="border-b border-border last:border-b-0"
            >
              <Td>
                {r.kind === "cash" ? (
                  <span className="text-foreground">Pure cash</span>
                ) : r.kind === "cash-investment" ? (
                  <span className="text-foreground">{r.name}</span>
                ) : (
                  <Link
                    href={`/portfolios/${r.portfolioId}`}
                    className="text-foreground hover:text-accent"
                  >
                    {r.name}
                  </Link>
                )}
              </Td>
              <Td align="right">
                <span className="tabular text-muted">
                  {formatTargetRange(
                    r.targetMinPercent.toString(),
                    r.targetMaxPercent.toString(),
                  )}
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
                <span className="tabular">
                  {formatCurrency(r.actualValueBase.toString(), baseCurrency)}
                </span>
              </Td>
            </tr>
          ))}
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

import Link from "next/link";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { GroupAllocation } from "@/lib/group-allocation";

type Props = {
  allocation: GroupAllocation;
  /** Window time-weighted return % per portfolio id. */
  returns?: Map<string, number>;
};

export function GroupAllocationTable({ allocation, returns }: Props) {
  const { rows, baseCurrency } = allocation;

  return (
    <div className="hairline overflow-x-auto bg-surface-elevated">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <Th>Holding</Th>
            <Th align="right">Target %</Th>
            <Th align="right">Actual %</Th>
            <Th align="right">Drift</Th>
            <Th align="right">Value</Th>
            <Th align="right">90d return</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.kind === "cash" ? "cash" : r.portfolioId}
              className="border-b border-border last:border-b-0"
            >
              <Td>
                {r.kind === "cash" ? (
                  <span className="text-foreground">Cash</span>
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
                  {formatNumber(r.targetPercent.toString(), { decimals: 2 })}%
                </span>
              </Td>
              <Td align="right">
                <span className="tabular">
                  {formatNumber(r.actualPercent.toString(), { decimals: 2 })}%
                </span>
              </Td>
              <Td align="right">
                <DriftCell drift={Number(r.driftPercent.toString())} />
              </Td>
              <Td align="right">
                <span className="tabular">
                  {formatCurrency(r.actualValueBase.toString(), baseCurrency)}
                </span>
              </Td>
              <Td align="right">
                <ReturnCell
                  value={
                    r.kind === "portfolio"
                      ? returns?.get(r.portfolioId)
                      : undefined
                  }
                />
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DriftCell({ drift }: { drift: number }) {
  if (Math.abs(drift) < 0.005) {
    return <span className="tabular text-muted">—</span>;
  }
  const tone = Math.abs(drift) >= 5 ? "text-loss" : "text-warning";
  const sign = drift > 0 ? "+" : "";
  return (
    <span className={`tabular ${tone}`}>
      {sign}
      {drift.toFixed(2)}%
    </span>
  );
}

function ReturnCell({ value }: { value: number | undefined }) {
  if (value === undefined) {
    return <span className="tabular text-muted">—</span>;
  }
  const tone =
    value > 0.005 ? "text-gain" : value < -0.005 ? "text-loss" : "text-muted";
  const sign = value > 0 ? "+" : "";
  return (
    <span className={`tabular ${tone}`}>
      {sign}
      {value.toFixed(2)}%
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

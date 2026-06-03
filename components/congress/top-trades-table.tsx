import Link from "next/link";
import { getTopClusters } from "@/lib/congress-trades";
import { formatCurrency, formatDate } from "@/lib/format";

type Props = {
  type: "buy" | "sell";
  since: Date;
  sector?: string;
  minAmount?: number;
};

export async function TopTradesTable({
  type,
  since,
  sector,
  minAmount,
}: Props) {
  const clusters = await getTopClusters({
    since,
    sector,
    minAmount,
    limit: 10,
  });
  const filtered = clusters
    .filter((c) => (type === "buy" ? c.buyCount > 0 : c.sellCount > 0))
    .sort((a, b) =>
      type === "buy" ? b.buyScore - a.buyScore : b.sellScore - a.sellScore,
    )
    .slice(0, 10);

  const title = type === "buy" ? "Top Bought" : "Top Sold";
  const countKey = type === "buy" ? "buyCount" : "sellCount";
  const volumeKey = type === "buy" ? "buyVolume" : "sellVolume";
  const badgeClass = type === "buy" ? "text-gain" : "text-loss";

  return (
    <div className="hairline bg-surface">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        <p className="mt-0.5 text-xs text-muted">
          {type === "buy"
            ? "Ranked by members buying + dollar size"
            : "Ranked by members selling + dollar size"}
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="px-5 py-8 text-sm text-muted">No data for this period</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-5 py-2 text-left text-xs text-muted font-normal">
                Ticker
              </th>
              <th className="px-5 py-2 text-left text-xs text-muted font-normal">
                Sector
              </th>
              <th className="px-5 py-2 text-right text-xs text-muted font-normal">
                Members
              </th>
              <th className="px-5 py-2 text-right text-xs text-muted font-normal">
                Volume
              </th>
              <th className="hidden px-5 py-2 text-right text-xs text-muted font-normal sm:table-cell">
                Latest
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const count = c[countKey];
              const volume = c[volumeKey];
              const members = c.politicians.slice(0, 3).join(", ");
              const extra =
                c.politicians.length > 3 ? ` +${c.politicians.length - 3}` : "";
              return (
                <tr
                  key={c.ticker}
                  className="border-b border-border last:border-0 hover:bg-surface-elevated"
                >
                  <td className="px-5 py-2.5">
                    <Link
                      href={`/stocks/${c.ticker}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {c.ticker}
                    </Link>
                    {members ? (
                      <p className="mt-0.5 max-w-[160px] truncate text-xs text-muted">
                        {members}
                        {extra}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-5 py-2.5 text-xs text-muted">
                    {c.sector ?? "—"}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <span
                      className={[
                        "tabular text-sm font-medium",
                        badgeClass,
                      ].join(" ")}
                    >
                      {count}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-right tabular text-xs text-muted">
                    {volume > 0
                      ? formatCurrency(volume, "USD", { compact: true })
                      : "—"}
                  </td>
                  <td className="hidden px-5 py-2.5 text-right text-xs text-muted tabular sm:table-cell">
                    {formatDate(c.latestDate)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import {
  type CrossSourceTicker,
  getCrossSourceTopTickers,
} from "@/lib/trade-signals";

type Props = {
  since: Date;
  limit?: number;
};

const CHIP_TONE: Record<CrossSourceTicker["sources"][number], string> = {
  House: "text-foreground",
  Senate: "text-foreground",
  Insider: "text-accent",
};

function sourceCount(row: CrossSourceTicker, source: string): number {
  const t =
    source === "House"
      ? row.house
      : source === "Senate"
        ? row.senate
        : row.insider;
  return t.buy + t.sell;
}

export async function CrossSourceLeaderboard({ since, limit = 15 }: Props) {
  const rows = await getCrossSourceTopTickers({ since, limit });

  return (
    <div className="hairline bg-surface">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-medium text-foreground">
          Cross-source activity
        </h2>
        <p className="mt-0.5 text-xs text-muted">
          Where Congress &amp; corporate insiders overlap — ranked by combined
          breadth and dollar size.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-8 text-sm text-muted">
          Populates once trade syncs have run.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-5 py-2 text-left text-xs font-normal text-muted">
                Ticker
              </th>
              <th className="px-5 py-2 text-left text-xs font-normal text-muted">
                Sources
              </th>
              <th className="px-5 py-2 text-right text-xs font-normal text-muted">
                Net
              </th>
              <th className="px-5 py-2 text-right text-xs font-normal text-muted">
                Size
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const net =
                row.netVolume > 0
                  ? { label: "BUY", tone: "text-gain" }
                  : row.netVolume < 0
                    ? { label: "SELL", tone: "text-loss" }
                    : { label: "MIXED", tone: "text-muted" };
              return (
                <tr
                  key={row.ticker}
                  className="border-b border-border last:border-0 hover:bg-surface-elevated"
                >
                  <td className="px-5 py-2.5">
                    <Link
                      href={`/stocks/${row.ticker}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {row.ticker}
                    </Link>
                    {row.sector ? (
                      <p className="mt-0.5 max-w-[160px] truncate text-xs text-muted">
                        {row.sector}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-5 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {row.sources.map((s) => (
                        <span
                          key={s}
                          className={`hairline label inline-flex items-center gap-1 bg-surface-elevated px-1.5 py-0.5 ${CHIP_TONE[s]}`}
                        >
                          {s}
                          <span className="tabular text-subtle">
                            {sourceCount(row, s)}
                          </span>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <span className={`label ${net.tone}`}>{net.label}</span>
                  </td>
                  <td className="px-5 py-2.5 text-right tabular text-xs text-muted">
                    {row.totalVolume > 0
                      ? formatCurrency(row.totalVolume, "USD", {
                          compact: true,
                        })
                      : "—"}
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

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

type Props = {
  instrument: {
    yahooSymbol: string;
    symbol: string;
    name: string;
    currency: string;
    exchange: string;
    sector: string | null;
  };
};

export function StockCard({ instrument }: Props) {
  return (
    <Link
      href={`/stocks/${encodeURIComponent(instrument.yahooSymbol)}`}
      className="group hairline flex flex-col gap-3 bg-surface p-5 transition-colors hover:border-border-strong"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="display tabular text-xl text-foreground">{instrument.symbol}</p>
          <p className="mt-1 line-clamp-2 text-sm text-muted">{instrument.name}</p>
        </div>
        <ArrowUpRight
          className="h-4 w-4 shrink-0 text-subtle transition-colors group-hover:text-accent"
          strokeWidth={1.5}
          aria-hidden
        />
      </div>
      <div className="mt-auto flex items-center justify-between border-t border-border pt-3 text-xs text-muted">
        <span className="label">
          {instrument.exchange} · {instrument.currency}
        </span>
        {instrument.sector ? <span className="truncate">{instrument.sector}</span> : null}
      </div>
    </Link>
  );
}

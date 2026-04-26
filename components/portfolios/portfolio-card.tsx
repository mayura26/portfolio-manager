import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { formatRelative } from "@/lib/format";

type Props = {
  portfolio: {
    id: string;
    name: string;
    description: string | null;
    baseCurrency: string;
    updatedAt: Date;
  };
};

export function PortfolioCard({ portfolio }: Props) {
  return (
    <Link
      href={`/portfolios/${portfolio.id}`}
      className="group hairline flex flex-col gap-4 bg-surface p-5 transition-colors hover:border-border-strong"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="display truncate text-xl text-foreground">{portfolio.name}</h3>
          {portfolio.description ? (
            <p className="mt-1 line-clamp-2 text-sm text-muted">{portfolio.description}</p>
          ) : null}
        </div>
        <ArrowUpRight
          className="h-4 w-4 shrink-0 text-subtle transition-colors group-hover:text-accent"
          strokeWidth={1.5}
          aria-hidden
        />
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-border pt-4 text-xs text-muted">
        <span className="label">Base · {portfolio.baseCurrency}</span>
        <span>Updated {formatRelative(portfolio.updatedAt)}</span>
      </div>
    </Link>
  );
}

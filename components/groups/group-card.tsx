import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { formatRelative } from "@/lib/format";

type Props = {
  group: {
    id: string;
    name: string;
    description: string | null;
    baseCurrency: string;
    updatedAt: Date;
    portfolios: { id: string }[];
  };
};

export function GroupCard({ group }: Props) {
  return (
    <Link
      href={`/groups/${group.id}`}
      className="group hairline flex flex-col gap-4 bg-surface p-5 transition-colors hover:border-border-strong"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="display truncate text-xl text-foreground">
            {group.name}
          </h3>
          {group.description ? (
            <p className="mt-1 line-clamp-2 text-sm text-muted">
              {group.description}
            </p>
          ) : null}
        </div>
        <ArrowUpRight
          className="h-4 w-4 shrink-0 text-subtle transition-colors group-hover:text-accent"
          strokeWidth={1.5}
          aria-hidden
        />
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-border pt-4 text-xs text-muted">
        <span className="label">
          {group.portfolios.length} portfolio
          {group.portfolios.length === 1 ? "" : "s"} · {group.baseCurrency}
        </span>
        <span>Updated {formatRelative(group.updatedAt)}</span>
      </div>
    </Link>
  );
}

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { AuditGap, AuditResult } from "@/lib/setup-audit";
import { AuditMuteButton } from "./audit-mute-button";

function GapRow({ gap, muted }: { gap: AuditGap; muted: boolean }) {
  return (
    <li
      className={[
        "hairline flex items-start justify-between gap-4 bg-surface-elevated p-4 transition-colors",
        muted ? "opacity-60" : "hover:border-border-strong",
      ].join(" ")}
    >
      <div className="min-w-0">
        <h3 className="text-sm font-medium text-foreground">{gap.title}</h3>
        <p className="mt-1 text-sm text-muted">{gap.detail}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        {!muted ? (
          <Link
            href={gap.fixHref}
            className="group inline-flex items-center gap-1 text-xs text-accent hover:text-accent-hover"
          >
            Resolve
            <ArrowUpRight
              className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              strokeWidth={1.5}
              aria-hidden
            />
          </Link>
        ) : null}
        <AuditMuteButton checkKey={gap.key} muted={muted} />
      </div>
    </li>
  );
}

export function AuditGapList({ result }: { result: AuditResult }) {
  const populated = result.categories.filter((c) => c.gaps.length > 0);

  return (
    <div className="flex flex-col gap-10">
      {populated.map((category) => (
        <section key={category.category}>
          <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
            <div>
              <h2 className="display text-2xl text-foreground">
                {category.label}
              </h2>
              <p className="mt-1 max-w-prose text-sm text-muted">
                {category.blurb}
              </p>
            </div>
            <span className="label tabular shrink-0">
              {category.gaps.length}{" "}
              {category.gaps.length === 1 ? "gap" : "gaps"}
            </span>
          </div>
          <ul className="mt-4 flex flex-col gap-3">
            {category.gaps.map((gap) => (
              <GapRow key={gap.key} gap={gap} muted={false} />
            ))}
          </ul>
        </section>
      ))}

      {result.muted.length > 0 ? (
        <details className="hairline bg-surface px-4 py-3">
          <summary className="label cursor-pointer select-none text-muted hover:text-foreground">
            Muted checks · {result.muted.length}
          </summary>
          <ul className="mt-4 flex flex-col gap-3">
            {result.muted.map((gap) => (
              <GapRow key={gap.key} gap={gap} muted />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

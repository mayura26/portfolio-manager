import Link from "next/link";
import type { ReactNode } from "react";
import type { WeeklyReportContent } from "@/lib/weekly-report-ai";

type Props = {
  content: WeeklyReportContent;
  weekRangeLabel: string;
  generatedAtLabel: string;
  model: string;
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border pt-5">
      <h3 className="label">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export function WeeklyReportView({
  content,
  weekRangeLabel,
  generatedAtLabel,
  model,
}: Props) {
  return (
    <article className="animate-fade-in flex flex-col gap-6">
      <header>
        <p className="label">Week of {weekRangeLabel}</p>
        <h2 className="display mt-2 text-3xl text-foreground">
          {content.headline}
        </h2>
        <p className="mt-3 max-w-prose text-base text-muted">
          {content.overview}
        </p>
      </header>

      <Section title="Performance">
        <p className="max-w-prose text-sm text-foreground">
          {content.performance}
        </p>
      </Section>

      {content.groups && content.groups.length > 0 ? (
        <Section title="Portfolio groups">
          <div className="grid gap-px overflow-hidden border border-border bg-border">
            {content.groups.map((group) => (
              <section
                key={group.groupName}
                className="bg-surface-elevated px-4 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="display text-xl text-foreground">
                      {group.groupName}
                    </h4>
                    <p className="mt-1 max-w-prose text-sm text-muted">
                      {group.headline}
                    </p>
                  </div>
                </div>

                <p className="mt-4 max-w-prose text-sm text-foreground">
                  {group.performance}
                </p>

                {group.notableMovers.length > 0 ? (
                  <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                    {group.notableMovers.map((mover) => (
                      <li
                        key={`${group.groupName}-${mover.symbol}-${mover.note}`}
                        className="border-t border-border pt-2 text-sm"
                      >
                        <Link
                          href={`/stocks/${encodeURIComponent(mover.symbol)}`}
                          className="tabular font-medium text-foreground hover:text-accent hover:underline"
                        >
                          {mover.symbol}
                        </Link>{" "}
                        <span className="text-muted">{mover.note}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <p className="mt-4 max-w-prose text-sm text-foreground">
                  {group.activity}
                </p>

                {group.watchpoints.length > 0 ? (
                  <ul className="mt-3 flex flex-col gap-1.5">
                    {group.watchpoints.map((point) => (
                      <li
                        key={`${group.groupName}-${point}`}
                        className="text-sm text-muted"
                      >
                        {point}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>
        </Section>
      ) : null}

      {content.notableMovers.length > 0 ? (
        <Section title="Notable movers">
          <ul className="flex flex-col divide-y divide-border">
            {content.notableMovers.map((mover) => (
              <li
                key={`${mover.symbol}-${mover.note}`}
                className="flex gap-3 py-3 first:pt-0 last:pb-0"
              >
                <Link
                  href={`/stocks/${encodeURIComponent(mover.symbol)}`}
                  className="tabular w-16 shrink-0 text-sm font-medium text-foreground hover:text-accent hover:underline"
                >
                  {mover.symbol}
                </Link>
                <span className="text-sm text-muted">{mover.note}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Activity">
        <p className="max-w-prose text-sm text-foreground">
          {content.activity}
        </p>
      </Section>

      {content.watchpoints.length > 0 ? (
        <Section title="Watchpoints for next week">
          <ul className="flex flex-col gap-2">
            {content.watchpoints.map((point, i) => (
              <li key={point} className="flex gap-3 text-sm text-foreground">
                <span className="tabular label shrink-0 pt-0.5 text-accent">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <footer className="border-t border-border pt-4 text-xs text-subtle">
        Generated {generatedAtLabel} · {model}
      </footer>
    </article>
  );
}

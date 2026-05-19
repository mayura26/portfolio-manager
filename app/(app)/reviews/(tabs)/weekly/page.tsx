import { ArrowUpRight, FileText } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { GenerateReportButton } from "@/components/reviews/generate-report-button";
import { WeeklyReportView } from "@/components/reviews/weekly-report-view";
import { Skeleton } from "@/components/shared/skeleton";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import {
  formatWeekRange,
  getPreviousWeekRange,
  toIsoDate,
} from "@/lib/week-range";
import type { WeeklyReportContent } from "@/lib/weekly-report-ai";

export default function WeeklyReportPage() {
  return (
    <div>
      <div className="mb-6">
        <p className="label">Weekly report</p>
        <p className="mt-1 max-w-prose text-sm text-muted">
          An AI-written review of each completed Sunday-to-Saturday week.
          Reports are saved once generated, so re-reading is instant.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-80 w-full" />}>
        <WeeklyContent />
      </Suspense>
    </div>
  );
}

async function WeeklyContent() {
  // Read uncached data before touching the clock — required under
  // Cache Components, which forbids `new Date()` during prerender.
  const reports = await db.weeklyReport.findMany({
    orderBy: { weekStart: "desc" },
  });

  const { weekStart, weekEnd } = getPreviousWeekRange();

  const latestReport = reports.find(
    (r) => r.weekStart.getTime() === weekStart.getTime(),
  );
  const archive = reports.filter((r) => r.id !== latestReport?.id);

  return (
    <div className="flex flex-col gap-10">
      <section>
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="label text-foreground">Latest week</h2>
          {latestReport ? (
            <GenerateReportButton
              mode="regenerate"
              reportId={latestReport.id}
            />
          ) : null}
        </div>

        {latestReport ? (
          <div className="hairline bg-surface-elevated p-6">
            <WeeklyReportView
              content={latestReport.content as unknown as WeeklyReportContent}
              weekRangeLabel={formatWeekRange(
                latestReport.weekStart,
                latestReport.weekEnd,
              )}
              generatedAtLabel={formatDateTime(latestReport.generatedAt)}
              model={latestReport.model}
            />
          </div>
        ) : (
          <div className="hairline flex flex-col items-center bg-surface px-6 py-14 text-center">
            <FileText
              className="mb-4 h-8 w-8 text-subtle"
              strokeWidth={1.25}
              aria-hidden
            />
            <h3 className="display text-2xl text-foreground">
              No report for {formatWeekRange(weekStart, weekEnd)}
            </h3>
            <p className="mt-2 max-w-sm text-sm text-muted">
              Generate the review for last week — performance, notable moves and
              activity, written up and saved.
            </p>
            <div className="mt-6">
              <GenerateReportButton
                mode="generate"
                weekStartIso={toIsoDate(weekStart)}
              />
            </div>
          </div>
        )}
      </section>

      {archive.length > 0 ? (
        <section>
          <h2 className="label mb-3 text-foreground">Archive</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {archive.map((report) => {
              const content = report.content as unknown as WeeklyReportContent;
              return (
                <li key={report.id}>
                  <Link
                    href={`/reviews/weekly/${report.id}`}
                    className="group hairline flex h-full flex-col gap-2 bg-surface-elevated p-4 transition-colors hover:border-border-strong"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="label">
                        {formatWeekRange(report.weekStart, report.weekEnd)}
                      </span>
                      <ArrowUpRight
                        className="h-4 w-4 shrink-0 text-subtle transition-colors group-hover:text-accent"
                        strokeWidth={1.5}
                        aria-hidden
                      />
                    </div>
                    <p className="text-sm text-foreground">
                      {content.headline}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

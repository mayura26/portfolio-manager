import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { GenerateReportButton } from "@/components/reviews/generate-report-button";
import { WeeklyReportView } from "@/components/reviews/weekly-report-view";
import { Skeleton } from "@/components/shared/skeleton";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { formatWeekRange } from "@/lib/week-range";
import type { WeeklyReportContent } from "@/lib/weekly-report-ai";

type Params = Promise<{ reportId: string }>;

export default function WeeklyReportDetailPage({
  params,
}: PageProps<"/reviews/weekly/[reportId]">) {
  return (
    <div>
      <nav className="label mb-6">
        <Link
          href="/reviews/weekly"
          className="text-muted hover:text-foreground"
        >
          Weekly report
        </Link>{" "}
        / Archive
      </nav>
      <Suspense fallback={<Skeleton className="h-80 w-full" />}>
        <ReportDetail params={params} />
      </Suspense>
    </div>
  );
}

async function ReportDetail({ params }: { params: Params }) {
  const { reportId } = await params;
  const report = await db.weeklyReport.findUnique({
    where: { id: reportId },
  });
  if (!report) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <GenerateReportButton mode="regenerate" reportId={report.id} />
      </div>
      <div className="hairline bg-surface-elevated p-6">
        <WeeklyReportView
          content={report.content as unknown as WeeklyReportContent}
          weekRangeLabel={formatWeekRange(report.weekStart, report.weekEnd)}
          generatedAtLabel={formatDateTime(report.generatedAt)}
          model={report.model}
        />
      </div>
    </div>
  );
}

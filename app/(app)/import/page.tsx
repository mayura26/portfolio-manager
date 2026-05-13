import { Suspense } from "react";
import { CsvImportSection } from "@/components/import/csv-import-section";
import { FlexSyncSection } from "@/components/import/flex-sync-section";
import { Skeleton } from "@/components/shared/skeleton";
import { db } from "@/lib/db";

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b border-border pb-6">
        <p className="label">Tools</p>
        <h1 className="display mt-2 text-4xl text-foreground">Import</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Import trades from Interactive Brokers into a portfolio.
        </p>
      </header>

      <div className="flex flex-col gap-12">
        <section>
          <h2 className="display mb-2 text-2xl text-foreground">CSV upload</h2>
          <p className="mb-6 max-w-prose text-sm text-muted">
            Download an Activity Statement from IBKR (Reports → Activity →
            Activity Statement, format: CSV) and upload it here. Only stock
            trades are imported; options, bonds, and forex are skipped.
            Re-uploading the same file is safe — duplicates are detected
            automatically.
          </p>
          <Suspense fallback={<Skeleton className="h-40 w-full max-w-xl" />}>
            <CsvSection />
          </Suspense>
        </section>

        <section>
          <h2 className="display mb-2 text-2xl text-foreground">
            Flex API sync
          </h2>
          <p className="mb-6 max-w-prose text-sm text-muted">
            Fetch trades directly from IBKR using the Flex Web Service. Select a
            portfolio group — trades are routed to whichever portfolio already
            holds the stock, or placed in an &ldquo;Unassigned&rdquo; portfolio
            for new positions. Configure Flex credentials per group in Group
            Settings.
          </p>
          <Suspense fallback={<Skeleton className="h-32 w-full max-w-xl" />}>
            <FlexSection />
          </Suspense>
        </section>
      </div>
    </div>
  );
}

async function CsvSection() {
  const portfolios = await db.portfolio.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return <CsvImportSection portfolios={portfolios} />;
}

async function FlexSection() {
  const groups = await db.portfolioGroup.findMany({
    select: {
      id: true,
      name: true,
      ibkrFlexToken: true,
      ibkrFlexQueryId: true,
    },
    orderBy: { name: "asc" },
  });
  return (
    <FlexSyncSection
      groups={groups.map((g) => ({
        id: g.id,
        name: g.name,
        hasCredentials: !!(g.ibkrFlexToken && g.ibkrFlexQueryId),
      }))}
    />
  );
}

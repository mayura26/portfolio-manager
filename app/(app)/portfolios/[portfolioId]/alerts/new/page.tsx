import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { createAlert } from "@/actions/alerts";
import { AlertForm } from "@/components/alerts/alert-form";
import { Skeleton } from "@/components/shared/skeleton";
import { db } from "@/lib/db";

type Params = Promise<{ portfolioId: string }>;

export default function NewPortfolioAlertPage({
  params,
}: PageProps<"/portfolios/[portfolioId]/alerts/new">) {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full max-w-xl" />}>
      <NewPortfolioAlertContent params={params} />
    </Suspense>
  );
}

async function NewPortfolioAlertContent({ params }: { params: Params }) {
  const { portfolioId } = await params;
  const portfolio = await db.portfolio.findUnique({
    where: { id: portfolioId },
  });
  if (!portfolio) notFound();

  const portfolios = await db.portfolio.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <nav className="label mb-6">
        <Link
          href={`/portfolios/${portfolio.id}/alerts`}
          className="text-muted hover:text-foreground"
        >
          Alerts
        </Link>{" "}
        / New
      </nav>
      <h2 className="display mb-6 text-3xl text-foreground">New alert</h2>
      <AlertForm
        action={createAlert}
        portfolios={portfolios}
        lockedPortfolioId={portfolio.id}
        cancelHref={`/portfolios/${portfolio.id}/alerts`}
      />
    </div>
  );
}

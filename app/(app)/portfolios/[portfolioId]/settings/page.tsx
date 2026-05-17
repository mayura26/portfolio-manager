import { notFound } from "next/navigation";
import { Suspense } from "react";
import { deletePortfolio, updatePortfolio } from "@/actions/portfolios";
import { DeletePortfolioButton } from "@/components/portfolios/delete-portfolio-button";
import { PortfolioForm } from "@/components/portfolios/portfolio-form";
import { Skeleton } from "@/components/shared/skeleton";
import { db } from "@/lib/db";

type Params = Promise<{ portfolioId: string }>;

export default function PortfolioSettingsPage({
  params,
}: PageProps<"/portfolios/[portfolioId]/settings">) {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <PortfolioSettings params={params} />
    </Suspense>
  );
}

async function PortfolioSettings({ params }: { params: Params }) {
  const { portfolioId } = await params;
  const [portfolio, groups] = await Promise.all([
    db.portfolio.findUnique({
      where: { id: portfolioId },
    }),
    db.portfolioGroup.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, baseCurrency: true },
    }),
  ]);
  if (!portfolio) notFound();

  const updateAction = updatePortfolio.bind(null, portfolio.id);
  const deleteAction = deletePortfolio.bind(null, portfolio.id);

  return (
    <div className="flex flex-col gap-12">
      <section>
        <h2 className="display mb-4 text-2xl text-foreground">Details</h2>
        <PortfolioForm
          action={updateAction}
          groups={groups}
          defaults={{
            groupId: portfolio.groupId,
            name: portfolio.name,
            description: portfolio.description,
            baseCurrency: portfolio.baseCurrency,
          }}
          submitLabel="Save changes"
          cancelHref={`/portfolios/${portfolio.id}`}
        />
      </section>

      <section>
        <h2 className="display mb-2 text-2xl text-loss">Danger zone</h2>
        <p className="mb-4 max-w-prose text-sm text-muted">
          Deleting this portfolio removes it and all associated trades and
          alerts. This cannot be undone.
        </p>
        <DeletePortfolioButton
          action={deleteAction}
          portfolioName={portfolio.name}
        />
      </section>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-10 w-full max-w-xl" />
      <Skeleton className="h-24 w-full max-w-xl" />
      <Skeleton className="h-10 w-full max-w-xl" />
    </div>
  );
}

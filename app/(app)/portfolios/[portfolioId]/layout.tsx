import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PortfolioTabs } from "@/components/portfolios/portfolio-tabs";
import { Skeleton } from "@/components/shared/skeleton";
import { db } from "@/lib/db";

type Params = Promise<{ portfolioId: string }>;

export default function PortfolioLayout({
  children,
  params,
}: LayoutProps<"/portfolios/[portfolioId]">) {
  return (
    <div className="mx-auto max-w-6xl">
      <Suspense fallback={<HeaderSkeleton />}>
        <PortfolioHeader params={params} />
      </Suspense>

      <Suspense fallback={<TabsSkeleton />}>
        <PortfolioTabsLoader params={params} />
      </Suspense>

      <div className="mt-8">{children}</div>
    </div>
  );
}

async function PortfolioHeader({ params }: { params: Params }) {
  const { portfolioId } = await params;
  const portfolio = await db.portfolio.findUnique({
    where: { id: portfolioId },
  });
  if (!portfolio) notFound();

  return (
    <>
      <nav className="label mb-6">
        <Link href="/portfolios" className="text-muted hover:text-foreground">
          Portfolios
        </Link>{" "}
        / {portfolio.name}
      </nav>

      <header className="mb-6 border-b border-border pb-6">
        <p className="label">Base · {portfolio.baseCurrency}</p>
        <h1 className="display mt-2 text-4xl text-foreground">
          {portfolio.name}
        </h1>
        {portfolio.description ? (
          <p className="mt-2 max-w-prose text-sm text-muted">
            {portfolio.description}
          </p>
        ) : null}
      </header>
    </>
  );
}

async function PortfolioTabsLoader({ params }: { params: Params }) {
  const { portfolioId } = await params;
  return <PortfolioTabs portfolioId={portfolioId} />;
}

function HeaderSkeleton() {
  return (
    <div className="mb-6">
      <Skeleton className="mb-3 h-3 w-32" />
      <Skeleton className="mb-3 h-10 w-64" />
      <Skeleton className="h-4 w-96" />
    </div>
  );
}

function TabsSkeleton() {
  return <Skeleton className="h-10 w-72" />;
}

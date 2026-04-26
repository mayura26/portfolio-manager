import { Suspense } from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import { createPortfolio } from "@/actions/portfolios";
import { PortfolioForm } from "@/components/portfolios/portfolio-form";
import { Skeleton } from "@/components/shared/skeleton";

export default function NewPortfolioPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <nav className="label mb-6">
        <Link href="/portfolios" className="text-muted hover:text-foreground">
          Portfolios
        </Link>{" "}
        / New
      </nav>

      <header className="mb-8 border-b border-border pb-6">
        <h1 className="display text-4xl text-foreground">New portfolio</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Group trades that share an investment thesis or reporting currency.
        </p>
      </header>

      <Suspense fallback={<Skeleton className="h-72 w-full max-w-xl" />}>
        <NewPortfolioForm />
      </Suspense>
    </div>
  );
}

async function NewPortfolioForm() {
  const settings = await db.settings.findUnique({ where: { id: "singleton" } });
  const defaultCurrency = settings?.defaultBaseCurrency ?? "USD";

  return (
    <PortfolioForm
      action={createPortfolio}
      defaults={{ baseCurrency: defaultCurrency }}
      submitLabel="Create portfolio"
      cancelHref="/portfolios"
    />
  );
}

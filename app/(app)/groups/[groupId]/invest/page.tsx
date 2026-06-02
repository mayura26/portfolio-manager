import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { InvestmentAllocatorClient } from "@/components/invest/investment-allocator-client";
import { Skeleton } from "@/components/shared/skeleton";
import { db } from "@/lib/db";
import { computeGroupAllocation } from "@/lib/group-allocation";
import { getSettings } from "@/lib/settings";

type Params = Promise<{ groupId: string }>;

export default function InvestPage({
  params,
}: {
  params: Params;
}) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <InvestPageContent params={params} />
    </Suspense>
  );
}

async function InvestPageContent({ params }: { params: Params }) {
  const { groupId } = await params;

  const [group, groupAllocation, settings] = await Promise.all([
    db.portfolioGroup.findUnique({ where: { id: groupId } }),
    computeGroupAllocation(groupId),
    getSettings(),
  ]);

  if (!group) notFound();

  const totalGroupValue = Number(groupAllocation.totalValueBase.toString());
  const minTradePercent = Number(settings.minTradePercent.toString());

  return (
    <div className="mx-auto max-w-3xl">
      <nav className="label mb-6">
        <Link href="/groups" className="text-muted hover:text-foreground">
          Groups
        </Link>{" "}
        /{" "}
        <Link
          href={`/groups/${group.id}`}
          className="text-muted hover:text-foreground"
        >
          {group.name}
        </Link>{" "}
        / Invest
      </nav>

      <header className="mb-8 border-b border-border pb-6">
        <p className="label">Base · {group.baseCurrency}</p>
        <h1 className="display mt-2 text-4xl text-foreground">Invest cash</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Enter the amount of cash you want to deploy. The AI will review your
          current positions, targets, and forecasts, then recommend where to put
          it — favouring high-conviction opportunities over thin spreading.
        </p>
      </header>

      <InvestmentAllocatorClient
        groupId={group.id}
        baseCurrency={group.baseCurrency}
        totalGroupValue={totalGroupValue}
        minTradePercent={minTradePercent}
      />
    </div>
  );
}

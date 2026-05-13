import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { setGroupTargets, updateGroup } from "@/actions/groups";
import { GroupForm } from "@/components/groups/group-form";
import { GroupTargetsEditor } from "@/components/groups/group-targets-editor";
import { IbkrGroupForm } from "@/components/groups/ibkr-group-form";
import { Skeleton } from "@/components/shared/skeleton";
import { db } from "@/lib/db";

type Params = Promise<{ groupId: string }>;

export default function GroupSettingsPage({
  params,
}: PageProps<"/groups/[groupId]/settings">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <GroupSettings params={params} />
    </Suspense>
  );
}

async function GroupSettings({ params }: { params: Params }) {
  const { groupId } = await params;
  const group = await db.portfolioGroup.findUnique({
    where: { id: groupId },
    include: { portfolios: { orderBy: { name: "asc" } } },
  });
  if (!group) notFound();

  const updateAction = updateGroup.bind(null, groupId);

  return (
    <div className="mx-auto max-w-3xl">
      <nav className="label mb-6">
        <Link href="/groups" className="text-muted hover:text-foreground">
          Groups
        </Link>{" "}
        /{" "}
        <Link
          href={`/groups/${groupId}`}
          className="text-muted hover:text-foreground"
        >
          {group.name}
        </Link>{" "}
        / Settings
      </nav>

      <header className="mb-8 border-b border-border pb-6">
        <h1 className="display text-4xl text-foreground">Group settings</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Edit metadata and bulk-set target weights. Cash + portfolio targets
          must sum to exactly 100%.
        </p>
      </header>

      <section className="mb-12">
        <h2 className="display mb-4 text-2xl text-foreground">Details</h2>
        <GroupForm
          action={updateAction}
          defaults={{
            name: group.name,
            description: group.description,
            baseCurrency: group.baseCurrency,
          }}
          submitLabel="Save details"
          cancelHref={`/groups/${groupId}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="display mb-4 text-2xl text-foreground">Targets</h2>
        <GroupTargetsEditor
          groupId={groupId}
          cashTargetPercent={group.cashTargetPercent.toString()}
          portfolios={group.portfolios.map((p) => ({
            id: p.id,
            name: p.name,
            targetPercentInGroup: p.targetPercentInGroup.toString(),
          }))}
          action={setGroupTargets}
        />
      </section>

      <section>
        <h2 className="display mb-2 text-2xl text-foreground">
          Interactive Brokers
        </h2>
        <p className="mb-4 max-w-prose text-sm text-muted">
          Link this group to an IBKR account. Trades synced via Flex API will be
          routed to whichever portfolio in this group already holds the stock,
          or placed in an &ldquo;Unassigned&rdquo; portfolio for you to sort
          later.
        </p>
        <IbkrGroupForm
          groupId={groupId}
          defaults={{
            ibkrFlexToken: group.ibkrFlexToken,
            ibkrFlexQueryId: group.ibkrFlexQueryId,
          }}
        />
      </section>
    </div>
  );
}

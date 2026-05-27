import { Layers, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { GroupCard } from "@/components/groups/group-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/shared/skeleton";
import { getGroupCardSummaries } from "@/lib/dashboard";
import { db } from "@/lib/db";

export default function GroupsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 flex items-end justify-between border-b border-border pb-6">
        <div>
          <p className="label">Allocation</p>
          <h1 className="display mt-2 text-4xl text-foreground">
            Portfolio groups
          </h1>
          <p className="mt-2 max-w-prose text-sm text-muted">
            A group is a top-level allocation bucket — its portfolios and a cash
            slot share a single sum-to-100 target.
          </p>
        </div>
        <Link
          href="/groups/new"
          className="inline-flex items-center gap-2 bg-accent px-4 py-2 text-sm text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          New group
        </Link>
      </header>

      <Suspense fallback={<GroupListSkeleton />}>
        <GroupList />
      </Suspense>
    </div>
  );
}

async function GroupList() {
  const [groups, summaries] = await Promise.all([
    db.portfolioGroup.findMany({
      orderBy: { createdAt: "desc" },
      include: { portfolios: { select: { id: true } } },
    }),
    getGroupCardSummaries(),
  ]);

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="No groups yet"
        description="Create your first group to organize portfolios under a single sum-to-100 target."
        action={{ href: "/groups/new", label: "Create group" }}
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((g) => (
        <GroupCard key={g.id} group={{ ...g, summary: summaries.get(g.id) }} />
      ))}
    </div>
  );
}

function GroupListSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-56" />
      ))}
    </div>
  );
}

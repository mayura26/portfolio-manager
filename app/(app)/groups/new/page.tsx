import Link from "next/link";
import { Suspense } from "react";
import { createGroup } from "@/actions/groups";
import { GroupForm } from "@/components/groups/group-form";
import { Skeleton } from "@/components/shared/skeleton";
import { db } from "@/lib/db";

export default function NewGroupPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <nav className="label mb-6">
        <Link href="/groups" className="text-muted hover:text-foreground">
          Groups
        </Link>{" "}
        / New
      </nav>

      <header className="mb-8 border-b border-border pb-6">
        <h1 className="display text-4xl text-foreground">New group</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Set the name, theme, and reporting currency. You'll add portfolios and
          set targets next.
        </p>
      </header>

      <Suspense fallback={<Skeleton className="h-72 w-full max-w-xl" />}>
        <NewGroupForm />
      </Suspense>
    </div>
  );
}

async function NewGroupForm() {
  const settings = await db.settings.findUnique({ where: { id: "singleton" } });
  const defaultCurrency = settings?.defaultBaseCurrency ?? "USD";

  return (
    <GroupForm
      action={createGroup}
      defaults={{ baseCurrency: defaultCurrency }}
      submitLabel="Create group"
      cancelHref="/groups"
    />
  );
}

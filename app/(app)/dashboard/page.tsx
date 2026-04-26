export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 border-b border-border pb-6">
        <p className="label">Today</p>
        <h1 className="display mt-2 text-4xl text-foreground">Dashboard</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Aggregate value, performance and review queue across every portfolio. Detail panels arrive
          in Phase 3.
        </p>
      </header>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <PlaceholderCard label="Total value" />
        <PlaceholderCard label="Unrealized P&L" />
        <PlaceholderCard label="Daily change" />
      </div>
    </div>
  );
}

function PlaceholderCard({ label }: { label: string }) {
  return (
    <div className="hairline bg-surface p-5">
      <p className="label">{label}</p>
      <p className="display tabular mt-3 text-3xl text-subtle">—</p>
    </div>
  );
}

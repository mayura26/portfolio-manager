export function StatsSkeleton() {
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <div className="h-7 w-48 animate-pulse bg-border" />
        <div className="h-4 w-72 animate-pulse bg-border" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="hairline animate-pulse bg-surface p-5">
              <div className="h-3 w-24 bg-border" />
              <div className="mt-3 h-9 w-36 bg-border" />
              <div className="mt-2 h-3 w-16 bg-border" />
              <div className="mt-2 h-3 w-20 bg-border" />
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="h-7 w-56 animate-pulse bg-border" />
        <div className="h-4 w-80 animate-pulse bg-border" />
        <div className="hairline animate-pulse bg-surface-elevated">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 border-b border-border px-5 py-4 last:border-0">
              <div className="h-9 w-9 shrink-0 bg-border" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-32 bg-border" />
                <div className="h-4 w-48 bg-border" />
              </div>
              <div className="space-y-1 text-right">
                <div className="h-6 w-24 bg-border" />
                <div className="h-3 w-16 bg-border" />
              </div>
              <div className="h-5 w-5 shrink-0 bg-border" />
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="h-7 w-24 animate-pulse bg-border" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="hairline animate-pulse bg-surface p-5">
              <div className="h-3 w-28 bg-border" />
              <div className="mt-3 h-9 w-32 bg-border" />
              <div className="mt-2 h-3 w-20 bg-border" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

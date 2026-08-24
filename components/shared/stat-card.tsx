import Link from "next/link";

type Tone = "gain" | "loss" | "neutral";

type BreakdownRow = {
  label: string;
  value: string;
  tone: Tone;
  swatch?: string;
  href?: string;
};

type Props = {
  label: string;
  value: string;
  hint?: string;
  delta?: { value: string; tone: Tone };
  breakdown?: BreakdownRow[];
};

function toneClass(tone: Tone): string {
  return tone === "gain"
    ? "text-gain"
    : tone === "loss"
      ? "text-loss"
      : "text-muted";
}

export function StatCard({ label, value, hint, delta, breakdown }: Props) {
  return (
    <div className="hairline bg-surface p-5">
      <p className="label">{label}</p>
      <p className="display tabular mt-3 text-3xl text-foreground">{value}</p>
      {delta ? (
        <p
          className={["tabular mt-2 text-sm", toneClass(delta.tone)].join(" ")}
        >
          {delta.value}
        </p>
      ) : null}
      {breakdown && breakdown.length > 0 ? (
        <div className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm">
          {breakdown.map((row) => (
            <BreakdownItem
              key={row.label}
              row={row}
              valueClass={toneClass(row.tone)}
            />
          ))}
        </div>
      ) : null}
      {hint ? <p className="mt-2 text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}

function BreakdownItem({
  row,
  valueClass,
}: {
  row: BreakdownRow;
  valueClass: string;
}) {
  const content = (
    <>
      <span className="flex min-w-0 items-center gap-1.5 text-muted">
        {row.swatch ? (
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 shrink-0"
            style={{ background: row.swatch }}
          />
        ) : null}
        <span className="truncate">{row.label}</span>
      </span>
      <span className={["tabular text-right", valueClass].join(" ")}>
        {row.value}
      </span>
    </>
  );

  if (row.href) {
    return (
      <Link
        href={row.href}
        className="-mx-2 flex items-baseline justify-between gap-3 px-2 py-1 transition-colors hover:bg-surface-elevated"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="flex items-baseline justify-between gap-3">{content}</div>
  );
}

type Tone = "gain" | "loss" | "neutral";

type BreakdownRow = {
  label: string;
  value: string;
  tone: Tone;
  swatch?: string;
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
        <dl className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm">
          {breakdown.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-3"
            >
              <dt className="flex min-w-0 items-center gap-1.5 text-muted">
                {row.swatch ? (
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 shrink-0"
                    style={{ background: row.swatch }}
                  />
                ) : null}
                <span className="truncate">{row.label}</span>
              </dt>
              <dd
                className={["tabular text-right", toneClass(row.tone)].join(
                  " ",
                )}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {hint ? <p className="mt-2 text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}

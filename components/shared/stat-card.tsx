type Props = {
  label: string;
  value: string;
  hint?: string;
  delta?: { value: string; tone: "gain" | "loss" | "neutral" };
};

export function StatCard({ label, value, hint, delta }: Props) {
  return (
    <div className="hairline bg-surface p-5">
      <p className="label">{label}</p>
      <p className="display tabular mt-3 text-3xl text-foreground">{value}</p>
      {delta ? (
        <p
          className={[
            "tabular mt-2 text-sm",
            delta.tone === "gain"
              ? "text-gain"
              : delta.tone === "loss"
                ? "text-loss"
                : "text-muted",
          ].join(" ")}
        >
          {delta.value}
        </p>
      ) : null}
      {hint ? <p className="mt-2 text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}

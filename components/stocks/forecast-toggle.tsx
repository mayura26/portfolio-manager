"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setForecastsEnabled } from "@/actions/instruments";

type Props = {
  instrumentId: string;
  enabled: boolean;
};

export function ForecastToggle({ instrumentId, enabled }: Props) {
  const router = useRouter();
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-pressed={isEnabled}
        disabled={pending}
        onClick={() => {
          const next = !isEnabled;
          setError(null);
          setIsEnabled(next);
          startTransition(async () => {
            const result = await setForecastsEnabled(instrumentId, next);
            if (!result.ok) {
              setIsEnabled(!next);
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
        className={[
          "inline-flex items-center gap-2 border px-3 py-1.5 text-xs transition-colors disabled:opacity-50",
          isEnabled
            ? "border-accent bg-surface-elevated text-accent"
            : "border-border bg-surface-elevated text-muted hover:text-foreground",
        ].join(" ")}
      >
        <span
          aria-hidden
          className={[
            "h-1.5 w-1.5 rounded-full",
            isEnabled ? "bg-accent" : "bg-muted",
          ].join(" ")}
        />
        {isEnabled ? "Forecasts on" : "Forecasts off"}
      </button>
      {error ? <span className="text-xs text-loss">{error}</span> : null}
    </div>
  );
}

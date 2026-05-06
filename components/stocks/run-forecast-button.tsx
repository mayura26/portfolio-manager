"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { generateStockForecast } from "@/actions/forecasts";

type Props = {
  instrumentId: string;
};

export function RunForecastButton({ instrumentId }: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const result = await generateStockForecast(instrumentId);
            if (!result.ok) setError(result.error);
          });
        }}
        className="inline-flex items-center gap-2 bg-accent px-3 py-1.5 text-xs text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
        {pending ? "Generating…" : "Generate forecast"}
      </button>
      {error ? <span className="text-xs text-loss">{error}</span> : null}
    </div>
  );
}

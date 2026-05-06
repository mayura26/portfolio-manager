"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import {
  analyzeGroupComposition,
  analyzePortfolioComposition,
} from "@/actions/composition";

type Props =
  | { scope: "portfolio"; portfolioId: string }
  | { scope: "group"; groupId: string };

export function RunCompositionButton(props: Props) {
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
            const result =
              props.scope === "portfolio"
                ? await analyzePortfolioComposition(props.portfolioId)
                : await analyzeGroupComposition(props.groupId);
            if (!result.ok) setError(result.error);
          });
        }}
        className="inline-flex items-center gap-2 bg-accent px-3 py-1.5 text-xs text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
        {pending ? "Analyzing…" : "Analyze composition"}
      </button>
      {error ? <span className="text-xs text-loss">{error}</span> : null}
    </div>
  );
}

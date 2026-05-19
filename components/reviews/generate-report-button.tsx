"use client";

import { RefreshCw, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import {
  generateWeeklyReport,
  regenerateWeeklyReport,
  type WeeklyReportActionState,
} from "@/actions/weekly-report";

type Props =
  | { mode: "generate"; weekStartIso: string; label?: string }
  | { mode: "regenerate"; reportId: string; label?: string };

export function GenerateReportButton(props: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const regenerate = props.mode === "regenerate";
  const Icon = regenerate ? RefreshCw : Sparkles;
  const idleLabel =
    props.label ?? (regenerate ? "Regenerate" : "Generate report");
  const busyLabel = regenerate ? "Regenerating…" : "Writing report…";

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      const result: WeeklyReportActionState = regenerate
        ? await regenerateWeeklyReport(props.reportId)
        : await generateWeeklyReport(props.weekStartIso);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={[
          "inline-flex items-center gap-2 px-4 py-2 text-sm transition-colors disabled:opacity-50",
          regenerate
            ? "hairline text-foreground hover:bg-surface-elevated"
            : "bg-accent text-accent-foreground hover:bg-accent-hover",
        ].join(" ")}
      >
        <Icon
          className={[
            "h-4 w-4",
            pending && regenerate ? "animate-spin" : "",
          ].join(" ")}
          strokeWidth={1.5}
          aria-hidden
        />
        {pending ? busyLabel : idleLabel}
      </button>
      {error ? (
        <p className="text-xs text-loss" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

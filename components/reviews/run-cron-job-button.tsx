"use client";

import { Play, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { runCronJob } from "@/actions/cron-jobs";

type Feedback =
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }
  | null;

const POLL_INTERVAL_MS = 4000;
const START_REFRESH_WINDOW_MS = 30 * 1000;

export function RunCronJobButton({
  job,
  isRunning,
}: {
  job: string;
  isRunning: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pollUntil, setPollUntil] = useState<number | null>(null);

  useEffect(() => {
    if (!isRunning && !pollUntil) return;
    const id = setInterval(() => {
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isRunning, pollUntil, router]);

  useEffect(() => {
    if (!pollUntil) return;
    const timeoutMs = Math.max(0, pollUntil - Date.now());
    const id = setTimeout(() => setPollUntil(null), timeoutMs);
    return () => clearTimeout(id);
  }, [pollUntil]);

  function handleClick() {
    setFeedback(null);
    startTransition(async () => {
      const result = await runCronJob(job);
      if (result.ok) {
        setFeedback({ kind: "success", message: "Started" });
        setPollUntil(Date.now() + START_REFRESH_WINDOW_MS);
        router.refresh();
        return;
      }
      setFeedback({ kind: "error", message: result.error });
    });
  }

  const disabled = isPending || isRunning;
  const label = isPending ? "Starting" : isRunning ? "Running" : "Run";
  const Icon = disabled ? RefreshCw : Play;

  return (
    <div className="flex items-center gap-2">
      {feedback ? (
        <output
          className={`text-xs ${feedback.kind === "success" ? "text-gain" : "text-loss"}`}
        >
          {feedback.message}
        </output>
      ) : null}
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className="hairline inline-flex items-center gap-1.5 bg-surface px-2.5 py-1.5 text-xs text-foreground transition-colors hover:border-border-strong disabled:opacity-50"
        aria-label={`Run ${job} cron job`}
      >
        <Icon
          className={`h-3.5 w-3.5 ${disabled ? "animate-spin" : ""}`}
          strokeWidth={1.5}
          aria-hidden
        />
        {label}
      </button>
    </div>
  );
}

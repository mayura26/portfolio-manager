"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { triggerPriceRefresh } from "@/actions/prices";

type Feedback =
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }
  | null;

const POLL_INTERVAL_MS = 4000;

export function RefreshPricesButton({ isRunning }: { isRunning: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

  // While a run is in-flight, poll the server so the panel picks up the
  // finished state without a manual reload.
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => {
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isRunning, router]);

  function handleClick() {
    setFeedback(null);
    startTransition(async () => {
      const res = await triggerPriceRefresh();
      if (res.ok) {
        setFeedback({ kind: "success", message: "Refresh started" });
        router.refresh();
      } else {
        setFeedback({ kind: "error", message: res.error });
      }
    });
  }

  const disabled = isPending || isRunning;
  const label = isPending
    ? "Starting…"
    : isRunning
      ? "Refreshing…"
      : "Refresh now";

  return (
    <div className="flex items-center gap-3">
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
        className="hairline inline-flex items-center gap-1.5 bg-surface px-3 py-1.5 text-xs text-foreground transition-colors hover:border-border-strong disabled:opacity-50"
      >
        <RefreshCw
          className={`h-3.5 w-3.5 ${disabled ? "animate-spin" : ""}`}
          strokeWidth={1.5}
          aria-hidden
        />
        {label}
      </button>
    </div>
  );
}

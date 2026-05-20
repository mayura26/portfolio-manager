"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { triggerFlexSync } from "@/actions/import";

type Feedback =
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }
  | null;

export function SyncNowButton({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

  function handleClick() {
    setFeedback(null);
    startTransition(async () => {
      const res = await triggerFlexSync(groupId);
      if (res.ok) {
        const parts: string[] = [];
        if (res.inserted > 0) parts.push(`${res.inserted} trades`);
        if (res.cashInserted > 0) parts.push(`${res.cashInserted} cash`);
        if (res.failed.length > 0)
          parts.push(`${res.failed.length} unresolved`);
        setFeedback({
          kind: res.failed.length > 0 ? "error" : "success",
          message:
            parts.length > 0 ? `Synced — ${parts.join(", ")}` : "No changes",
        });
        router.refresh();
      } else {
        setFeedback({ kind: "error", message: res.error });
      }
    });
  }

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
        disabled={isPending}
        className="hairline inline-flex items-center gap-1.5 bg-surface px-3 py-1.5 text-xs text-foreground transition-colors hover:border-border-strong disabled:opacity-50"
      >
        <RefreshCw
          className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`}
          strokeWidth={1.5}
          aria-hidden
        />
        {isPending ? "Syncing…" : "Sync now"}
      </button>
    </div>
  );
}

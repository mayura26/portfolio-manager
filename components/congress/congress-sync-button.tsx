"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { syncCongressTrades } from "@/actions/congress-trades";

export function CongressSyncButton() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSync() {
    startTransition(async () => {
      const result = await syncCongressTrades();
      if (result.ok) {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleSync}
        disabled={pending}
        className="inline-flex items-center gap-2 bg-accent px-4 py-2 text-sm text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
      >
        <RefreshCw
          className={["h-4 w-4", pending ? "animate-spin" : ""].join(" ")}
          strokeWidth={1.5}
        />
        {pending ? "Syncing…" : "Sync trades"}
      </button>
    </div>
  );
}

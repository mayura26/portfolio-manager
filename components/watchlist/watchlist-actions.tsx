"use client";

import { Archive, CheckCircle, Sparkles, Trash2 } from "lucide-react";
import { useTransition } from "react";
import {
  analyzeWatchlistItem,
  archiveWatchlistItem,
  deleteWatchlistItem,
  markAsBought,
} from "@/actions/watchlist";

type Props = {
  itemId: string;
  status: "WATCHING" | "ARCHIVED" | "BOUGHT";
};

export function WatchlistActions({ itemId, status }: Props) {
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<unknown>) {
    startTransition(() => {
      void fn();
    });
  }

  if (status !== "WATCHING") return null;

  return (
    <div className="flex items-center gap-1">
      <ActionButton
        label={pending ? "Analysing…" : "Analyse"}
        icon={Sparkles}
        onClick={() => run(() => analyzeWatchlistItem(itemId))}
        pending={pending}
      />
      <ActionButton
        label="Mark bought"
        icon={CheckCircle}
        onClick={() => run(() => markAsBought(itemId))}
        pending={pending}
      />
      <ActionButton
        label="Archive"
        icon={Archive}
        onClick={() => run(() => archiveWatchlistItem(itemId))}
        pending={pending}
      />
      <ActionButton
        label="Delete"
        icon={Trash2}
        tone="loss"
        onClick={() => {
          if (!window.confirm("Delete this watchlist item?")) return;
          run(() => deleteWatchlistItem(itemId));
        }}
        pending={pending}
      />
    </div>
  );
}

function ActionButton({
  label,
  icon: Icon,
  onClick,
  pending,
  tone = "muted",
}: {
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  onClick: () => void;
  pending: boolean;
  tone?: "muted" | "loss";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      title={label}
      aria-label={label}
      className={[
        "inline-flex items-center gap-1 px-2 py-1 text-xs transition-colors disabled:opacity-50",
        tone === "loss"
          ? "text-loss hover:underline"
          : "text-muted hover:text-foreground",
      ].join(" ")}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

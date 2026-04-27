"use client";

import { useTransition } from "react";
import { Bell, BellOff, Clock, Trash2 } from "lucide-react";
import {
  deleteAlert,
  dismissAlert,
  reactivateAlert,
  snoozeAlert,
} from "@/actions/alerts";

type Status = "ACTIVE" | "TRIGGERED" | "SNOOZED" | "DISMISSED";

type Props = {
  alertId: string;
  status: Status;
};

export function AlertActions({ alertId, status }: Props) {
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<void>) {
    startTransition(() => {
      void fn();
    });
  }

  return (
    <div className="flex items-center gap-1">
      {status === "ACTIVE" || status === "TRIGGERED" ? (
        <ActionButton
          label="Snooze 24h"
          icon={Clock}
          onClick={() => run(() => snoozeAlert(alertId, 24))}
          pending={pending}
        />
      ) : null}
      {status !== "DISMISSED" ? (
        <ActionButton
          label="Dismiss"
          icon={BellOff}
          onClick={() => run(() => dismissAlert(alertId))}
          pending={pending}
        />
      ) : (
        <ActionButton
          label="Reactivate"
          icon={Bell}
          onClick={() => run(() => reactivateAlert(alertId))}
          pending={pending}
        />
      )}
      <ActionButton
        label="Delete"
        icon={Trash2}
        tone="loss"
        onClick={() => {
          if (!window.confirm("Delete this alert?")) return;
          run(() => deleteAlert(alertId));
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
        tone === "loss" ? "text-loss hover:underline" : "text-muted hover:text-foreground",
      ].join(" ")}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

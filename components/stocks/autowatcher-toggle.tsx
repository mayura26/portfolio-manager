"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { setAutoWatcher } from "@/actions/instruments";

type Props = {
  instrumentId: string;
  enabled: boolean;
  threshold: number;
};

export function AutoWatcherToggle({ instrumentId, enabled, threshold }: Props) {
  const [isPending, startTransition] = useTransition();
  const [localThreshold, setLocalThreshold] = useState(threshold);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleToggle() {
    startTransition(async () => {
      await setAutoWatcher(instrumentId, !enabled, localThreshold);
    });
  }

  function commitThreshold(value: number) {
    if (value === threshold || !enabled) return;
    const clamped = Math.max(1, Math.min(100, value));
    setLocalThreshold(clamped);
    startTransition(async () => {
      await setAutoWatcher(instrumentId, true, clamped);
    });
  }

  function handleThresholdKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  }

  return (
    <div
      className={[
        "hairline inline-flex items-center gap-2.5 bg-surface-elevated px-3 py-2 text-xs transition-colors",
        enabled ? "border-accent/50" : "",
      ]
        .join(" ")
        .trim()}
    >
      {/* Icon */}
      <span
        className={`flex-shrink-0 transition-colors ${enabled ? "text-accent" : "text-subtle"}`}
      >
        {enabled ? (
          <Eye className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
        ) : (
          <EyeOff className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
        )}
      </span>

      {/* Label */}
      <span
        className={`label whitespace-nowrap ${enabled ? "text-foreground" : "text-muted"}`}
      >
        AutoWatcher
      </span>

      {/* Threshold input — visible when enabled */}
      {enabled ? (
        <span className="flex items-center gap-1 text-muted">
          <span className="label text-subtle">every</span>
          <input
            ref={inputRef}
            type="number"
            min={1}
            max={100}
            step={5}
            value={localThreshold}
            onChange={(e) => setLocalThreshold(Number(e.target.value))}
            onBlur={(e) => commitThreshold(Number(e.target.value))}
            onKeyDown={handleThresholdKeyDown}
            className="label w-10 bg-transparent text-center text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            aria-label="Alert threshold percent"
          />
          <span className="label text-subtle">%</span>
        </span>
      ) : null}

      {/* Toggle */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={isPending}
        aria-label={enabled ? "Disable AutoWatcher" : "Enable AutoWatcher"}
        aria-pressed={enabled}
        className="flex-shrink-0"
      >
        {isPending ? (
          <Loader2
            className="h-3.5 w-3.5 animate-spin text-muted"
            strokeWidth={1.5}
            aria-hidden
          />
        ) : (
          <span
            className={[
              "relative inline-flex h-4 w-7 cursor-pointer items-center rounded-full transition-colors duration-200",
              enabled ? "bg-accent" : "bg-border",
            ].join(" ")}
          >
            <span
              className={[
                "absolute h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-transform duration-200",
                enabled ? "translate-x-3.5" : "translate-x-0.5",
              ].join(" ")}
            />
          </span>
        )}
      </button>
    </div>
  );
}

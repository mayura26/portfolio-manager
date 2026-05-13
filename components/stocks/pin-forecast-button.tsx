"use client";

import { useTransition } from "react";
import { pinForecast, unpinForecast } from "@/actions/forecasts";

type Props = {
  forecastId: string;
  isPinned: boolean;
};

export function PinForecastButton({ forecastId, isPinned }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      if (isPinned) {
        await unpinForecast(forecastId);
      } else {
        await pinForecast(forecastId);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={[
        "hairline px-2 py-1 text-xs transition-colors disabled:opacity-50",
        isPinned
          ? "bg-accent text-accent-foreground"
          : "text-muted hover:text-foreground",
      ].join(" ")}
    >
      {isPending ? "…" : isPinned ? "Unpin" : "Pin as active"}
    </button>
  );
}

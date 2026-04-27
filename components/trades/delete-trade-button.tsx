"use client";

import { useTransition } from "react";

type Props = {
  action: () => Promise<void>;
};

export function DeleteTradeButton({ action }: Props) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    const ok = window.confirm("Delete this trade? Holdings will be recalculated.");
    if (!ok) return;
    startTransition(() => {
      void action();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="hairline border-loss/40 bg-loss-soft px-4 py-2 text-sm text-loss transition-colors hover:bg-loss hover:text-accent-foreground disabled:opacity-50"
    >
      {pending ? "Deleting…" : "Delete trade"}
    </button>
  );
}

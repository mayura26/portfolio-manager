"use client";

import { useTransition } from "react";

type Props = {
  action: () => Promise<void>;
  portfolioName: string;
};

export function DeletePortfolioButton({ action, portfolioName }: Props) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    const ok = window.confirm(
      `Delete "${portfolioName}"? All trades and alerts associated with this portfolio will be removed.`,
    );
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
      {pending ? "Deleting…" : "Delete portfolio"}
    </button>
  );
}

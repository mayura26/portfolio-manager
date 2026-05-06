"use client";

import { Trash2 } from "lucide-react";
import { useTransition } from "react";
import { deleteCashTransaction } from "@/actions/cash";

type Props = {
  transactionId: string;
};

export function DeleteCashButton({ transactionId }: Props) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (
          !confirm("Delete this cash transaction? Cash totals will recompute.")
        )
          return;
        start(() => {
          void deleteCashTransaction(transactionId);
        });
      }}
      className="text-subtle transition-colors hover:text-loss disabled:opacity-50"
      aria-label="Delete cash transaction"
    >
      <Trash2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
    </button>
  );
}

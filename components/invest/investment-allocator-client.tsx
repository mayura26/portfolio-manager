"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { generateInvestmentAllocation } from "@/actions/investment-allocator";
import { type InvestmentAllocation } from "@/lib/investment-allocator";
import { InvestmentAllocationResult } from "./investment-allocation-result";

type Props = {
  groupId: string;
  baseCurrency: string;
  totalGroupValue: number;
  minTradePercent: number;
};

export function InvestmentAllocatorClient({
  groupId,
  baseCurrency,
  totalGroupValue,
  minTradePercent,
}: Props) {
  const [pending, start] = useTransition();
  const [cashInput, setCashInput] = useState("");
  const [result, setResult] = useState<InvestmentAllocation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cashAmount = Number(cashInput);
  const minTradeAmount = (totalGroupValue * minTradePercent) / 100;
  const valid = cashAmount > 0 && !Number.isNaN(cashAmount);

  function handleGenerate() {
    if (!valid) return;
    setError(null);
    setResult(null);
    start(async () => {
      const res = await generateInvestmentAllocation(groupId, cashAmount);
      if (res.ok) {
        setResult(res.result);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="hairline bg-surface px-5 py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-2">
            <label htmlFor="cashToInvest" className="label">
              Cash to invest ({baseCurrency})
            </label>
            <input
              id="cashToInvest"
              type="number"
              min="0"
              step="any"
              value={cashInput}
              onChange={(e) => setCashInput(e.target.value)}
              placeholder="e.g. 2000"
              className="hairline w-64 bg-background px-3 py-2 text-sm text-foreground placeholder:text-subtle"
              disabled={pending}
            />
            {minTradeAmount > 0 ? (
              <p className="text-xs text-subtle">
                Min trade size:{" "}
                <span className="text-foreground">
                  {minTradeAmount.toLocaleString(undefined, {
                    style: "currency",
                    currency: baseCurrency,
                    maximumFractionDigits: 0,
                  })}
                </span>{" "}
                ({minTradePercent}% of group value)
              </p>
            ) : null}
          </div>

          <button
            type="button"
            disabled={pending || !valid}
            onClick={handleGenerate}
            className="inline-flex items-center gap-2 bg-accent px-4 py-2 text-sm text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            {pending ? "Analysing…" : "Generate allocation"}
          </button>
        </div>

        {error ? (
          <p className="mt-3 text-sm text-loss">{error}</p>
        ) : null}
      </div>

      {pending ? (
        <div className="hairline bg-surface px-5 py-8 text-center text-sm text-muted">
          Analysing your portfolio and market conditions…
        </div>
      ) : null}

      {result && !pending ? (
        <InvestmentAllocationResult result={result} baseCurrency={baseCurrency} />
      ) : null}
    </div>
  );
}

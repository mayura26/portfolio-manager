"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  type PortfolioTargetsActionState,
  setPortfolioTargets,
} from "@/actions/portfolio-targets";
import { SumToHundredIndicator } from "@/components/shared/sum-to-hundred-indicator";

type Row = {
  instrumentId: string;
  symbol: string;
  name: string;
  currency: string;
  targetPercent: string;
  intendedBuyPrice: string;
  notes: string;
  isHeld: boolean;
};

type Instrument = {
  id: string;
  symbol: string;
  name: string;
  currency: string;
};

type Props = {
  portfolioId: string;
  initialRows: Row[];
  selectableInstruments: Instrument[];
  watchlistBuyPrices?: Record<string, string>;
};

export function HoldingTargetsEditor({
  portfolioId,
  initialRows,
  selectableInstruments,
  watchlistBuyPrices = {},
}: Props) {
  const bound = setPortfolioTargets.bind(null, portfolioId);
  const [state, formAction, pending] = useActionState<
    PortfolioTargetsActionState | undefined,
    FormData
  >(bound, undefined);

  const [rows, setRows] = useState<Row[]>(initialRows);
  const [pickerValue, setPickerValue] = useState("");

  const sum = useMemo(
    () => rows.reduce((acc, r) => acc + Number(r.targetPercent || 0), 0),
    [rows],
  );

  const availableToAdd = selectableInstruments.filter(
    (i) => !rows.some((r) => r.instrumentId === i.id),
  );

  const updateRow = (id: string, patch: Partial<Row>) => {
    setRows((prev) =>
      prev.map((r) => (r.instrumentId === id ? { ...r, ...patch } : r)),
    );
  };

  const addRow = () => {
    if (!pickerValue) return;
    const found = selectableInstruments.find((i) => i.id === pickerValue);
    if (!found) return;
    setRows((prev) => [
      ...prev,
      {
        instrumentId: found.id,
        symbol: found.symbol,
        name: found.name,
        currency: found.currency,
        targetPercent: "0",
        intendedBuyPrice: watchlistBuyPrices[found.id] ?? "",
        notes: "",
        isHeld: false,
      },
    ]);
    setPickerValue("");
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.instrumentId !== id));
  };

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state && !state.ok ? (
        <div
          className="hairline border-loss/40 bg-loss-soft px-4 py-3 text-sm text-loss"
          role="alert"
        >
          {state.error}
        </div>
      ) : null}

      <div className="hairline overflow-x-auto bg-surface-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="label px-3 py-3">Instrument</th>
              <th className="label px-3 py-3 text-right">Target %</th>
              <th className="label px-3 py-3 text-right">Intended buy price</th>
              <th className="label px-3 py-3">Notes</th>
              <th className="label px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-sm text-muted"
                >
                  No targets yet. Add an instrument below to start.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.instrumentId}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="px-3 py-3">
                    <input
                      type="hidden"
                      name="instrumentId"
                      value={r.instrumentId}
                    />
                    <span className="tabular font-medium">{r.symbol}</span>
                    <span className="ml-2 text-muted">{r.name}</span>
                    <div className="label mt-0.5 text-subtle">
                      {r.currency}
                      {!r.isHeld ? " · target only" : ""}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <input
                      name="targetPercent"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      required
                      value={r.targetPercent}
                      onChange={(e) =>
                        updateRow(r.instrumentId, {
                          targetPercent: e.target.value,
                        })
                      }
                      className="hairline tabular w-24 bg-surface px-2 py-1 text-right text-sm"
                    />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <input
                      name="intendedBuyPrice"
                      type="number"
                      min="0"
                      step="0.0001"
                      placeholder="—"
                      value={r.intendedBuyPrice}
                      onChange={(e) =>
                        updateRow(r.instrumentId, {
                          intendedBuyPrice: e.target.value,
                        })
                      }
                      className="hairline tabular w-32 bg-surface px-2 py-1 text-right text-sm"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      name="notes"
                      type="text"
                      maxLength={500}
                      placeholder="—"
                      value={r.notes}
                      onChange={(e) =>
                        updateRow(r.instrumentId, { notes: e.target.value })
                      }
                      className="hairline w-full bg-surface px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => removeRow(r.instrumentId)}
                      className="text-subtle transition-colors hover:text-loss"
                      aria-label={`Remove ${r.symbol}`}
                    >
                      <Trash2
                        className="h-4 w-4"
                        strokeWidth={1.5}
                        aria-hidden
                      />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <select
          value={pickerValue}
          onChange={(e) => setPickerValue(e.target.value)}
          className="hairline bg-surface px-2 py-2 text-sm"
        >
          <option value="">Add instrument…</option>
          {availableToAdd.map((i) => (
            <option key={i.id} value={i.id}>
              {i.symbol} — {i.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={addRow}
          disabled={!pickerValue}
          className="hairline px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground disabled:opacity-50"
        >
          Add row
        </button>
      </div>

      <div className="flex items-center justify-between">
        <SumToHundredIndicator sum={sum} />
        <div className="flex items-center gap-3">
          <Link
            href={`/portfolios/${portfolioId}`}
            className="px-4 py-2 text-sm text-muted hover:text-foreground"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={
              pending || (rows.length > 0 && Math.abs(sum - 100) > 0.0001)
            }
            className="bg-accent px-4 py-2 text-sm text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save targets"}
          </button>
          {state?.ok ? <span className="text-sm text-gain">Saved</span> : null}
        </div>
      </div>
    </form>
  );
}

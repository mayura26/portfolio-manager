"use client";

import { Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  generatePortfolioTargetRecommendation,
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
  targetMinPercent: string;
  targetMaxPercent: string;
  intendedBuyPrice: string;
  intendedSellPrice: string;
  trimAtGainPercent: string;
  recommendationAction: string;
  recommendationSource: string;
  recommendationRationale: string;
  recommendationGeneratedAt: string;
  recommendationModel: string;
  recommendationReasoningEffort: string;
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

const rowHasPlan = (r: Row) =>
  Boolean(r.intendedBuyPrice || r.intendedSellPrice || r.trimAtGainPercent);

/** Textarea that grows to fit its content, so it never shows an inner scrollbar. */
function AutoTextarea({ value, ...props }: React.ComponentProps<"textarea">) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Runs after every render so the box also resizes when `value` is set
  // externally (e.g. an AI-drafted rationale), not just on user input.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  });
  return <textarea ref={ref} value={value} {...props} />;
}

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
  const [aiPending, startAiTransition] = useTransition();
  const [aiPendingInstrumentId, setAiPendingInstrumentId] = useState<
    string | null
  >(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const minSum = useMemo(
    () => rows.reduce((acc, r) => acc + Number(r.targetMinPercent || 0), 0),
    [rows],
  );
  const maxSum = useMemo(
    () => rows.reduce((acc, r) => acc + Number(r.targetMaxPercent || 0), 0),
    [rows],
  );
  const midpointSum = useMemo(
    () => rows.reduce((acc, r) => acc + Number(r.targetPercent || 0), 0),
    [rows],
  );
  const rangeOk = minSum <= 100.0001 && maxSum >= 99.9999;
  const rowsOk = rows.every(
    (r) => Number(r.targetMinPercent || 0) <= Number(r.targetMaxPercent || 0),
  );

  const availableToAdd = selectableInstruments.filter(
    (i) => !rows.some((r) => r.instrumentId === i.id),
  );
  const emptyPlanCount = rows.filter((r) => !rowHasPlan(r)).length;
  const busy = aiPending || generatingAll;

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
        targetMinPercent: "0",
        targetMaxPercent: "0",
        intendedBuyPrice: watchlistBuyPrices[found.id] ?? "",
        intendedSellPrice: "",
        trimAtGainPercent: "",
        recommendationAction: "BUY",
        recommendationSource: "MANUAL",
        recommendationRationale: "Target-only instrument to consider buying.",
        recommendationGeneratedAt: "",
        recommendationModel: "",
        recommendationReasoningEffort: "",
        notes: "",
        isHeld: false,
      },
    ]);
    setPickerValue("");
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.instrumentId !== id));
  };

  const markManual = (id: string, patch: Partial<Row>) => {
    updateRow(id, {
      ...patch,
      recommendationSource: "MANUAL",
      recommendationGeneratedAt: "",
      recommendationModel: "",
      recommendationReasoningEffort: "",
    });
  };

  const applyRecommendation = (
    id: string,
    rec: Extract<
      Awaited<ReturnType<typeof generatePortfolioTargetRecommendation>>,
      { ok: true }
    >["recommendation"],
  ) => {
    updateRow(id, {
      recommendationAction: rec.action,
      recommendationSource: rec.source,
      recommendationRationale: rec.rationale,
      recommendationGeneratedAt: rec.generatedAt,
      recommendationModel: rec.model,
      recommendationReasoningEffort: rec.reasoningEffort,
      // Only overwrite a level when the model proposed one.
      ...(rec.intendedBuyPrice
        ? { intendedBuyPrice: rec.intendedBuyPrice }
        : {}),
      ...(rec.intendedSellPrice
        ? { intendedSellPrice: rec.intendedSellPrice }
        : {}),
      ...(rec.trimAtGainPercent
        ? { trimAtGainPercent: rec.trimAtGainPercent }
        : {}),
    });
  };

  const draftFor = (row: Row) => ({
    targetMinPercent: row.targetMinPercent,
    targetMaxPercent: row.targetMaxPercent,
    intendedBuyPrice: row.intendedBuyPrice,
    intendedSellPrice: row.intendedSellPrice,
    trimAtGainPercent: row.trimAtGainPercent,
    notes: row.notes,
  });

  const generateRecommendation = (row: Row) => {
    setAiError(null);
    setAiPendingInstrumentId(row.instrumentId);
    startAiTransition(async () => {
      const result = await generatePortfolioTargetRecommendation(
        portfolioId,
        row.instrumentId,
        draftFor(row),
      );
      if (!result.ok) {
        setAiError(result.error);
        setAiPendingInstrumentId(null);
        return;
      }
      applyRecommendation(row.instrumentId, result.recommendation);
      setAiPendingInstrumentId(null);
    });
  };

  const generateAllEmpty = async () => {
    setAiError(null);
    setGeneratingAll(true);
    for (const row of rows.filter((r) => !rowHasPlan(r))) {
      setAiPendingInstrumentId(row.instrumentId);
      const result = await generatePortfolioTargetRecommendation(
        portfolioId,
        row.instrumentId,
        draftFor(row),
      );
      if (result.ok) {
        applyRecommendation(row.instrumentId, result.recommendation);
      } else {
        setAiError(result.error);
      }
    }
    setAiPendingInstrumentId(null);
    setGeneratingAll(false);
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
      {aiError ? (
        <div
          className="hairline border-loss/40 bg-loss-soft px-4 py-3 text-sm text-loss"
          role="alert"
        >
          {aiError}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="hairline bg-surface-elevated px-4 py-10 text-center text-sm text-muted">
          No targets yet. Add an instrument below to start.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => {
            const rowBusy = aiPendingInstrumentId === r.instrumentId;
            return (
              <article
                key={r.instrumentId}
                className="hairline flex flex-col gap-3 bg-surface-elevated p-4"
              >
                <input
                  type="hidden"
                  name="instrumentId"
                  value={r.instrumentId}
                />
                <input
                  type="hidden"
                  name="recommendationAction"
                  value={r.recommendationAction || "BUY"}
                />
                <input
                  type="hidden"
                  name="recommendationSource"
                  value={r.recommendationSource}
                />
                <input
                  type="hidden"
                  name="recommendationGeneratedAt"
                  value={r.recommendationGeneratedAt}
                />
                <input
                  type="hidden"
                  name="recommendationModel"
                  value={r.recommendationModel}
                />
                <input
                  type="hidden"
                  name="recommendationReasoningEffort"
                  value={r.recommendationReasoningEffort}
                />

                <header className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="tabular font-medium">{r.symbol}</span>
                      <span className="truncate text-muted">{r.name}</span>
                    </div>
                    <div className="label mt-0.5 text-subtle">
                      {r.currency}
                      {!r.isHeld ? " · target only" : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => generateRecommendation(r)}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-accent transition-colors hover:text-accent-hover disabled:opacity-50"
                    >
                      <Sparkles
                        className="h-3.5 w-3.5"
                        strokeWidth={1.5}
                        aria-hidden
                      />
                      {rowBusy ? "Generating" : "Generate"}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRow(r.instrumentId)}
                      className="p-1 text-subtle transition-colors hover:text-loss"
                      aria-label={`Remove ${r.symbol}`}
                    >
                      <Trash2
                        className="h-4 w-4"
                        strokeWidth={1.5}
                        aria-hidden
                      />
                    </button>
                  </div>
                </header>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                  <span className="label text-subtle">Target band</span>
                  <input
                    name="targetMinPercent"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    required
                    value={r.targetMinPercent}
                    onChange={(e) =>
                      updateRow(r.instrumentId, {
                        targetMinPercent: e.target.value,
                        targetPercent: (
                          (Number(e.target.value || 0) +
                            Number(r.targetMaxPercent || 0)) /
                          2
                        ).toString(),
                      })
                    }
                    className="hairline tabular w-20 bg-surface px-2 py-1 text-right text-sm"
                  />
                  <span className="text-subtle">–</span>
                  <input
                    name="targetMaxPercent"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    required
                    value={r.targetMaxPercent}
                    onChange={(e) =>
                      updateRow(r.instrumentId, {
                        targetMaxPercent: e.target.value,
                        targetPercent: (
                          (Number(r.targetMinPercent || 0) +
                            Number(e.target.value || 0)) /
                          2
                        ).toString(),
                      })
                    }
                    className="hairline tabular w-20 bg-surface px-2 py-1 text-right text-sm"
                  />
                  <span className="text-subtle">%</span>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <PlanLevel
                    label="Buy below"
                    prefix={r.currency}
                    active={!!r.intendedBuyPrice}
                  >
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
                      className="tabular w-full min-w-0 bg-transparent text-sm outline-none"
                    />
                  </PlanLevel>
                  <PlanLevel
                    label="Trim at"
                    suffix="% gain"
                    active={!!r.trimAtGainPercent}
                  >
                    <input
                      name="trimAtGainPercent"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="—"
                      value={r.trimAtGainPercent}
                      onChange={(e) =>
                        updateRow(r.instrumentId, {
                          trimAtGainPercent: e.target.value,
                        })
                      }
                      className="tabular w-full min-w-0 bg-transparent text-sm outline-none"
                    />
                  </PlanLevel>
                  <PlanLevel
                    label="Sell at"
                    prefix={r.currency}
                    active={!!r.intendedSellPrice}
                  >
                    <input
                      name="intendedSellPrice"
                      type="number"
                      min="0"
                      step="0.0001"
                      placeholder="—"
                      value={r.intendedSellPrice}
                      onChange={(e) =>
                        updateRow(r.instrumentId, {
                          intendedSellPrice: e.target.value,
                        })
                      }
                      className="tabular w-full min-w-0 bg-transparent text-sm outline-none"
                    />
                  </PlanLevel>
                </div>

                <AutoTextarea
                  name="recommendationRationale"
                  maxLength={1000}
                  rows={2}
                  placeholder="Rationale — why these levels? (the Generate button drafts this)"
                  value={r.recommendationRationale}
                  onChange={(e) =>
                    markManual(r.instrumentId, {
                      recommendationRationale: e.target.value,
                    })
                  }
                  className="hairline w-full resize-none overflow-hidden bg-surface px-2 py-1.5 text-sm"
                />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <input
                    name="notes"
                    type="text"
                    maxLength={500}
                    placeholder="Notes (optional)"
                    value={r.notes}
                    onChange={(e) =>
                      updateRow(r.instrumentId, { notes: e.target.value })
                    }
                    className="hairline w-full max-w-xs bg-surface px-2 py-1 text-sm"
                  />
                  {r.recommendationSource ? (
                    <span className="label text-subtle">
                      {r.recommendationSource === "AI"
                        ? "AI generated"
                        : "Manual"}
                    </span>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
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
        {emptyPlanCount > 0 ? (
          <button
            type="button"
            onClick={generateAllEmpty}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-accent transition-colors hover:text-accent-hover disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
            {generatingAll
              ? "Generating…"
              : `Generate all empty plans (${emptyPlanCount})`}
          </button>
        ) : null}
      </div>

      <div className="flex items-center justify-between">
        <SumToHundredIndicator
          minSum={minSum}
          maxSum={maxSum}
          label={`Range midpoint ${midpointSum.toFixed(2)}%`}
        />
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
              pending || busy || (rows.length > 0 && (!rangeOk || !rowsOk))
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

function PlanLevel({
  label,
  prefix,
  suffix,
  active,
  children,
}: {
  label: string;
  prefix?: string;
  suffix?: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`hairline px-2.5 py-2 ${active ? "bg-surface" : "bg-surface/40"}`}
    >
      <div className="label flex items-center gap-1.5 text-subtle">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            active ? "bg-accent" : "bg-border"
          }`}
        />
        {label}
      </div>
      <div className="mt-1 flex items-center gap-1">
        {prefix ? <span className="text-xs text-subtle">{prefix}</span> : null}
        {children}
        {suffix ? <span className="text-xs text-subtle">{suffix}</span> : null}
      </div>
    </div>
  );
}

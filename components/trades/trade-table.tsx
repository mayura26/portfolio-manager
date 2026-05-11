"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { moveTrades, moveTradesBySymbol } from "@/actions/trades";
import { formatCurrency, formatDate, formatQuantity } from "@/lib/format";

type TradeRow = {
  id: string;
  date: Date;
  type: "BUY" | "SELL";
  quantity: { toString: () => string };
  price: { toString: () => string };
  currency: string;
  fees: { toString: () => string };
  fxRate: { toString: () => string } | null;
  instrument: {
    id: string;
    symbol: string;
    name: string;
    yahooSymbol: string;
  };
};

type MoveTarget = {
  id: string;
  name: string;
  groupName: string;
  baseCurrency: string;
};

type Props = {
  portfolioId: string;
  trades: TradeRow[];
  moveTargets: MoveTarget[];
};

type FeedbackTone = "info" | "error";
type Feedback = { tone: FeedbackTone; message: string } | null;

export function TradeTable({ portfolioId, trades, moveTargets }: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [rowTargetId, setRowTargetId] = useState("");
  const [symbolInstrumentId, setSymbolInstrumentId] = useState("");
  const [symbolTargetId, setSymbolTargetId] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, startTransition] = useTransition();

  const symbolOptions = useMemo(() => {
    const seen = new Map<
      string,
      { id: string; symbol: string; name: string }
    >();
    for (const t of trades) {
      if (!seen.has(t.instrument.id)) {
        seen.set(t.instrument.id, {
          id: t.instrument.id,
          symbol: t.instrument.symbol,
          name: t.instrument.name,
        });
      }
    }
    return [...seen.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [trades]);

  const allSelected = trades.length > 0 && selected.size === trades.length;
  const someSelected = selected.size > 0 && !allSelected;
  const canMoveSelected =
    !pending && selected.size > 0 && rowTargetId.length > 0;
  const canMoveSymbol =
    !pending && symbolInstrumentId.length > 0 && symbolTargetId.length > 0;

  function toggleRow(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    if (checked) setSelected(new Set(trades.map((t) => t.id)));
    else setSelected(new Set());
  }

  function handleMoveSelected() {
    if (selected.size === 0 || !rowTargetId) return;
    const ids = [...selected];
    const target = moveTargets.find((t) => t.id === rowTargetId);
    setFeedback(null);
    startTransition(async () => {
      const result = await moveTrades(ids, rowTargetId);
      if (result.ok) {
        setSelected(new Set());
        setRowTargetId("");
        setFeedback({
          tone: "info",
          message: `Moved ${result.moved} trade${result.moved === 1 ? "" : "s"} to ${target?.groupName ?? ""} / ${target?.name ?? ""}.`,
        });
      } else {
        setFeedback({ tone: "error", message: result.error });
      }
    });
  }

  function handleMoveSymbol() {
    if (!symbolInstrumentId || !symbolTargetId) return;
    const symbol = symbolOptions.find((s) => s.id === symbolInstrumentId);
    const target = moveTargets.find((t) => t.id === symbolTargetId);
    setFeedback(null);
    startTransition(async () => {
      const result = await moveTradesBySymbol(
        portfolioId,
        symbolInstrumentId,
        symbolTargetId,
      );
      if (result.ok) {
        setSymbolInstrumentId("");
        setSymbolTargetId("");
        setFeedback({
          tone: "info",
          message: `Moved ${result.moved} ${symbol?.symbol ?? ""} trade${result.moved === 1 ? "" : "s"} to ${target?.groupName ?? ""} / ${target?.name ?? ""}.`,
        });
      } else {
        setFeedback({ tone: "error", message: result.error });
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <MoveToolbar
        selectedCount={selected.size}
        pending={pending}
        moveTargets={moveTargets}
        symbolOptions={symbolOptions}
        rowTargetId={rowTargetId}
        onRowTargetChange={setRowTargetId}
        canMoveSelected={canMoveSelected}
        onMoveSelected={handleMoveSelected}
        symbolInstrumentId={symbolInstrumentId}
        onSymbolInstrumentChange={setSymbolInstrumentId}
        symbolTargetId={symbolTargetId}
        onSymbolTargetChange={setSymbolTargetId}
        canMoveSymbol={canMoveSymbol}
        onMoveSymbol={handleMoveSymbol}
      />

      {feedback ? (
        <div
          role={feedback.tone === "error" ? "alert" : "status"}
          className={[
            "hairline px-3 py-2 text-xs",
            feedback.tone === "error"
              ? "border-loss/40 bg-loss-soft text-loss"
              : "border-accent/30 bg-surface-elevated text-foreground",
          ].join(" ")}
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="hairline overflow-x-auto bg-surface-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <Th>
                <input
                  type="checkbox"
                  aria-label="Select all trades"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={(e) => toggleAll(e.target.checked)}
                  className="cursor-pointer accent-accent"
                />
              </Th>
              <Th>Date</Th>
              <Th>Side</Th>
              <Th>Instrument</Th>
              <Th align="right">Quantity</Th>
              <Th align="right">Price</Th>
              <Th align="right">Fees</Th>
              <Th align="right">FX rate</Th>
              <Th align="right">{""}</Th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => {
              const isSelected = selected.has(trade.id);
              return (
                <tr
                  key={trade.id}
                  className={[
                    "border-b border-border last:border-b-0",
                    isSelected ? "bg-surface" : "",
                  ].join(" ")}
                >
                  <Td>
                    <input
                      type="checkbox"
                      aria-label={`Select trade on ${formatDate(trade.date)}`}
                      checked={isSelected}
                      onChange={(e) => toggleRow(trade.id, e.target.checked)}
                      className="cursor-pointer accent-accent"
                    />
                  </Td>
                  <Td>
                    <span className="tabular text-muted">
                      {formatDate(trade.date)}
                    </span>
                  </Td>
                  <Td>
                    <span
                      className={[
                        "label inline-flex items-center px-2 py-0.5",
                        trade.type === "BUY"
                          ? "border border-gain/30 bg-gain-soft text-gain"
                          : "border border-loss/30 bg-loss-soft text-loss",
                      ].join(" ")}
                    >
                      {trade.type}
                    </span>
                  </Td>
                  <Td>
                    <Link
                      href={`/stocks/${trade.instrument.yahooSymbol}`}
                      className="text-foreground hover:text-accent"
                    >
                      <span className="tabular font-medium">
                        {trade.instrument.symbol}
                      </span>{" "}
                      <span className="text-muted">
                        {trade.instrument.name}
                      </span>
                    </Link>
                  </Td>
                  <Td align="right">
                    <span className="tabular">
                      {formatQuantity(trade.quantity.toString())}
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="tabular">
                      {formatCurrency(trade.price.toString(), trade.currency)}
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="tabular text-muted">
                      {formatCurrency(trade.fees.toString(), trade.currency)}
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="tabular text-muted">
                      {trade.fxRate
                        ? Number(trade.fxRate.toString()).toFixed(4)
                        : "—"}
                    </span>
                  </Td>
                  <Td align="right">
                    <Link
                      href={`/portfolios/${portfolioId}/trades/${trade.id}`}
                      className="text-xs text-accent hover:underline"
                    >
                      Edit
                    </Link>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type ToolbarProps = {
  selectedCount: number;
  pending: boolean;
  moveTargets: MoveTarget[];
  symbolOptions: { id: string; symbol: string; name: string }[];
  rowTargetId: string;
  onRowTargetChange: (value: string) => void;
  canMoveSelected: boolean;
  onMoveSelected: () => void;
  symbolInstrumentId: string;
  onSymbolInstrumentChange: (value: string) => void;
  symbolTargetId: string;
  onSymbolTargetChange: (value: string) => void;
  canMoveSymbol: boolean;
  onMoveSymbol: () => void;
};

function MoveToolbar({
  selectedCount,
  pending,
  moveTargets,
  symbolOptions,
  rowTargetId,
  onRowTargetChange,
  canMoveSelected,
  onMoveSelected,
  symbolInstrumentId,
  onSymbolInstrumentChange,
  symbolTargetId,
  onSymbolTargetChange,
  canMoveSymbol,
  onMoveSymbol,
}: ToolbarProps) {
  if (moveTargets.length === 0) return null;

  return (
    <div className="hairline flex flex-col gap-3 bg-surface-elevated p-3 md:flex-row md:items-end md:gap-6">
      <div className="flex flex-col gap-1">
        <span className="label text-muted">
          Move selected{" "}
          <span className="tabular text-foreground">({selectedCount})</span>
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <PortfolioSelect
            id="move-selected-target"
            value={rowTargetId}
            onChange={onRowTargetChange}
            options={moveTargets}
            placeholder="Choose target portfolio"
            disabled={pending}
          />
          <button
            type="button"
            onClick={onMoveSelected}
            disabled={!canMoveSelected}
            className="inline-flex items-center bg-accent px-3 py-1.5 text-xs text-accent-foreground transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Moving…" : "Move selected"}
          </button>
        </div>
      </div>

      <div className="h-px w-full bg-border md:h-8 md:w-px" aria-hidden />

      <div className="flex flex-col gap-1">
        <span className="label text-muted">Move all of symbol</span>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={symbolInstrumentId}
            onChange={(e) => onSymbolInstrumentChange(e.target.value)}
            disabled={pending || symbolOptions.length === 0}
            className="hairline bg-surface px-2 py-1 text-xs text-foreground disabled:opacity-50"
            aria-label="Symbol to move"
          >
            <option value="">Symbol…</option>
            {symbolOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.symbol} — {s.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted">to</span>
          <PortfolioSelect
            id="move-symbol-target"
            value={symbolTargetId}
            onChange={onSymbolTargetChange}
            options={moveTargets}
            placeholder="Target portfolio"
            disabled={pending}
          />
          <button
            type="button"
            onClick={onMoveSymbol}
            disabled={!canMoveSymbol}
            className="inline-flex items-center bg-accent px-3 py-1.5 text-xs text-accent-foreground transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Moving…" : "Move symbol"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PortfolioSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: MoveTarget[];
  placeholder: string;
  disabled?: boolean;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, MoveTarget[]>();
    for (const opt of options) {
      const list = map.get(opt.groupName) ?? [];
      list.push(opt);
      map.set(opt.groupName, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [options]);

  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || options.length === 0}
      className="hairline bg-surface px-2 py-1 text-xs text-foreground disabled:opacity-50"
    >
      <option value="">{placeholder}</option>
      {grouped.map(([groupName, items]) => (
        <optgroup key={groupName} label={groupName}>
          {items.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.name} ({opt.baseCurrency})
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`label px-3 py-3 ${align === "right" ? "text-right" : "text-left"}`}
      scope="col"
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className={`px-3 py-3 ${align === "right" ? "text-right" : "text-left"}`}
    >
      {children}
    </td>
  );
}

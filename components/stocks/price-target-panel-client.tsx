"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  createPriceTarget,
  deletePriceTarget,
  type PriceTargetActionState,
} from "@/actions/price-targets";

type Target = {
  id: string;
  kind: "buy" | "sell";
  price: number;
  note: string | null;
};

type Props = {
  instrumentId: string;
  currency: string;
  currentPrice: number | null;
  targets: Target[];
};

type Mode = "PRICE" | "PERCENT";

export function PriceTargetPanelClient({
  instrumentId,
  currency,
  currentPrice,
  targets,
}: Props) {
  const [mode, setMode] = useState<Mode>("PRICE");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [state, formAction, pending] = useActionState<
    PriceTargetActionState | undefined,
    FormData
  >(createPriceTarget, undefined);

  const fmt = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }),
    [currency],
  );

  // Clear inputs once a target is created.
  useEffect(() => {
    if (state?.ok) {
      setValue("");
      setNote("");
    }
  }, [state]);

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  const preview = useMemo(() => {
    const num = Number(value);
    if (value.trim() === "" || Number.isNaN(num) || num === 0) return null;
    if (currentPrice == null || currentPrice <= 0) return null;
    if (mode === "PRICE" && num <= 0) return null;
    const target = mode === "PRICE" ? num : currentPrice * (1 + num / 100);
    if (target <= 0 || target === currentPrice) return null;
    const isSell = target > currentPrice;
    const pct = (target / currentPrice - 1) * 100;
    return { isSell, target, pct };
  }, [value, mode, currentPrice]);

  return (
    <div className="hairline bg-surface p-4">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium text-foreground">
          Your price targets
        </h3>
        {currentPrice != null ? (
          <span className="tabular text-xs text-muted">
            Now {fmt.format(currentPrice)}
          </span>
        ) : null}
      </div>
      <p className="mb-3 text-xs text-subtle">
        A target above the current price is a sell target; below it is a buy
        target. Both trigger a review and a notification when hit.
      </p>

      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="instrumentId" value={instrumentId} />
        <input type="hidden" name="mode" value={mode} />

        {state && !state.ok ? (
          <div
            className="hairline border-loss/40 bg-loss-soft px-3 py-2 text-xs text-loss"
            role="alert"
          >
            {state.error}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-none border border-border">
            <ModeButton
              active={mode === "PRICE"}
              onClick={() => setMode("PRICE")}
              label="Price"
              bordered
            />
            <ModeButton
              active={mode === "PERCENT"}
              onClick={() => setMode("PERCENT")}
              label="% move"
            />
          </div>
          <input
            name="value"
            type="number"
            inputMode="decimal"
            step="any"
            min={mode === "PRICE" ? "0" : undefined}
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={mode === "PRICE" ? "Target price" : "e.g. 8 or -10"}
            className="hairline tabular w-36 bg-surface px-3 py-2 text-sm text-foreground"
          />
          <input
            name="note"
            type="text"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className="hairline min-w-40 flex-1 bg-surface px-3 py-2 text-sm text-foreground"
          />
          <button
            type="submit"
            disabled={pending}
            className="bg-accent px-4 py-2 text-sm text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {pending ? "Adding…" : "Add"}
          </button>
        </div>

        {fieldErrors?.value?.[0] ? (
          <p className="text-xs text-loss">{fieldErrors.value[0]}</p>
        ) : null}

        <p className="text-xs text-subtle">
          {mode === "PERCENT"
            ? "Percent move from the current price — positive is above (sell), negative is below (buy)."
            : "Enter an absolute price level."}
          {preview ? (
            <span className="ml-1 text-foreground">
              → {preview.isSell ? "Sell" : "Buy"} target at{" "}
              <span className="tabular">{fmt.format(preview.target)}</span> (
              {preview.pct >= 0 ? "+" : ""}
              {preview.pct.toFixed(1)}%)
            </span>
          ) : null}
        </p>
      </form>

      <div className="mt-4 border-t border-border pt-3">
        {targets.length === 0 ? (
          <p className="text-xs text-subtle">No price targets yet.</p>
        ) : (
          <ul className="flex flex-col">
            {targets.map((t) => {
              const distance =
                currentPrice != null && currentPrice > 0
                  ? (t.price / currentPrice - 1) * 100
                  : null;
              return (
                <li
                  key={t.id}
                  className="flex items-center gap-3 border-b border-border py-2 text-sm last:border-b-0"
                >
                  <span
                    aria-hidden
                    className="text-[#14b8a6]"
                    title={t.kind === "sell" ? "Sell target" : "Buy target"}
                  >
                    {t.kind === "sell" ? "▲" : "▼"}
                  </span>
                  <span className="w-12 text-xs uppercase tracking-wide text-muted">
                    {t.kind}
                  </span>
                  <span className="tabular text-foreground">
                    {fmt.format(t.price)}
                  </span>
                  {distance != null ? (
                    <span className="tabular text-xs text-muted">
                      {distance >= 0 ? "+" : ""}
                      {distance.toFixed(1)}%
                    </span>
                  ) : null}
                  {t.note ? (
                    <span className="truncate text-xs text-subtle">
                      {t.note}
                    </span>
                  ) : null}
                  <form
                    action={deletePriceTarget.bind(null, t.id)}
                    className="ml-auto"
                  >
                    <button
                      type="submit"
                      aria-label="Delete target"
                      className="px-2 py-1 text-xs text-subtle transition-colors hover:text-loss"
                    >
                      Remove
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  label,
  bordered,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  bordered?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        "h-9 px-3 text-xs tabular transition-colors",
        bordered ? "border-r border-border" : "",
        active
          ? "bg-foreground text-background"
          : "text-muted hover:bg-surface-elevated hover:text-foreground",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

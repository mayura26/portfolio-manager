"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { GroupActionState } from "@/actions/groups";
import { SumToHundredIndicator } from "@/components/shared/sum-to-hundred-indicator";

type Portfolio = {
  id: string;
  name: string;
  targetMinPercentInGroup: string;
  targetMaxPercentInGroup: string;
};

type TargetRange = {
  min: string;
  max: string;
};

type Props = {
  groupId: string;
  cashTargetMinPercent: string;
  cashTargetMaxPercent: string;
  hisaTargetMinPercent: string;
  hisaTargetMaxPercent: string;
  portfolios: Portfolio[];
  action: (
    groupId: string,
    state: GroupActionState | undefined,
    formData: FormData,
  ) => Promise<GroupActionState>;
};

export function GroupTargetsEditor({
  groupId,
  cashTargetMinPercent,
  cashTargetMaxPercent,
  hisaTargetMinPercent,
  hisaTargetMaxPercent,
  portfolios,
  action,
}: Props) {
  const bound = action.bind(null, groupId);
  const [state, formAction, pending] = useActionState<
    GroupActionState | undefined,
    FormData
  >(bound, undefined);

  const [cash, setCash] = useState({
    min: cashTargetMinPercent,
    max: cashTargetMaxPercent,
  });
  const [hisa, setHisa] = useState({
    min: hisaTargetMinPercent,
    max: hisaTargetMaxPercent,
  });
  const [values, setValues] = useState<Record<string, TargetRange>>(
    Object.fromEntries(
      portfolios.map((p) => [
        p.id,
        {
          min: p.targetMinPercentInGroup,
          max: p.targetMaxPercentInGroup,
        },
      ]),
    ),
  );

  const minSum =
    Number(cash.min || 0) +
    Number(hisa.min || 0) +
    portfolios.reduce((acc, p) => acc + Number(values[p.id]?.min || 0), 0);
  const maxSum =
    Number(cash.max || 0) +
    Number(hisa.max || 0) +
    portfolios.reduce((acc, p) => acc + Number(values[p.id]?.max || 0), 0);
  const midpointSum =
    (Number(cash.min || 0) + Number(cash.max || 0)) / 2 +
    (Number(hisa.min || 0) + Number(hisa.max || 0)) / 2 +
    portfolios.reduce(
      (acc, p) =>
        acc +
        (Number(values[p.id]?.min || 0) + Number(values[p.id]?.max || 0)) / 2,
      0,
    );
  const rangeOk = minSum <= 100.0001 && maxSum >= 99.9999;
  const rowsOk =
    Number(cash.min || 0) <= Number(cash.max || 0) &&
    Number(hisa.min || 0) <= Number(hisa.max || 0) &&
    portfolios.every(
      (p) => Number(values[p.id]?.min || 0) <= Number(values[p.id]?.max || 0),
    );

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

      <div className="hairline overflow-hidden bg-surface-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="label px-3 py-3">Portfolio</th>
              <th className="label px-3 py-3 text-right">Min %</th>
              <th className="label px-3 py-3 text-right">Max %</th>
            </tr>
          </thead>
          <tbody>
            {portfolios.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="px-3 py-6 text-center text-sm text-muted"
                >
                  No portfolios in this group yet.
                </td>
              </tr>
            ) : (
              portfolios.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="px-3 py-3">
                    <input type="hidden" name="portfolioId" value={p.id} />
                    <span className="text-foreground">{p.name}</span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <input
                      name="portfolioTargetMinPercent"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      required
                      value={values[p.id]?.min ?? ""}
                      onChange={(e) =>
                        setValues((v) => ({
                          ...v,
                          [p.id]: {
                            min: e.target.value,
                            max: v[p.id]?.max ?? "",
                          },
                        }))
                      }
                      className="hairline tabular w-24 bg-surface px-2 py-1 text-right text-sm"
                    />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <input
                      name="portfolioTargetMaxPercent"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      required
                      value={values[p.id]?.max ?? ""}
                      onChange={(e) =>
                        setValues((v) => ({
                          ...v,
                          [p.id]: {
                            min: v[p.id]?.min ?? "",
                            max: e.target.value,
                          },
                        }))
                      }
                      className="hairline tabular w-24 bg-surface px-2 py-1 text-right text-sm"
                    />
                  </td>
                </tr>
              ))
            )}
            <tr className="bg-surface">
              <td className="px-3 py-3 text-foreground">Pure cash</td>
              <td className="px-3 py-3 text-right">
                <input
                  name="cashTargetMinPercent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  required
                  value={cash.min}
                  onChange={(e) =>
                    setCash((prev) => ({ ...prev, min: e.target.value }))
                  }
                  className="hairline tabular w-24 bg-surface px-2 py-1 text-right text-sm"
                />
              </td>
              <td className="px-3 py-3 text-right">
                <input
                  name="cashTargetMaxPercent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  required
                  value={cash.max}
                  onChange={(e) =>
                    setCash((prev) => ({ ...prev, max: e.target.value }))
                  }
                  className="hairline tabular w-24 bg-surface px-2 py-1 text-right text-sm"
                />
              </td>
            </tr>
            <tr className="bg-surface">
              <td className="px-3 py-3 text-foreground">HISA</td>
              <td className="px-3 py-3 text-right">
                <input
                  name="hisaTargetMinPercent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  required
                  value={hisa.min}
                  onChange={(e) =>
                    setHisa((prev) => ({ ...prev, min: e.target.value }))
                  }
                  className="hairline tabular w-24 bg-surface px-2 py-1 text-right text-sm"
                />
              </td>
              <td className="px-3 py-3 text-right">
                <input
                  name="hisaTargetMaxPercent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  required
                  value={hisa.max}
                  onChange={(e) =>
                    setHisa((prev) => ({ ...prev, max: e.target.value }))
                  }
                  className="hairline tabular w-24 bg-surface px-2 py-1 text-right text-sm"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <SumToHundredIndicator
          minSum={minSum}
          maxSum={maxSum}
          label={`Range midpoint ${midpointSum.toFixed(2)}%`}
        />
        <div className="flex items-center gap-3">
          <Link
            href={`/groups/${groupId}`}
            className="px-4 py-2 text-sm text-muted hover:text-foreground"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={pending || !rangeOk || !rowsOk}
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

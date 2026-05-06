"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { GroupActionState } from "@/actions/groups";
import { SumToHundredIndicator } from "@/components/shared/sum-to-hundred-indicator";

type Portfolio = {
  id: string;
  name: string;
  targetPercentInGroup: string;
};

type Props = {
  groupId: string;
  cashTargetPercent: string;
  portfolios: Portfolio[];
  action: (
    groupId: string,
    state: GroupActionState | undefined,
    formData: FormData,
  ) => Promise<GroupActionState>;
};

export function GroupTargetsEditor({
  groupId,
  cashTargetPercent,
  portfolios,
  action,
}: Props) {
  const bound = action.bind(null, groupId);
  const [state, formAction, pending] = useActionState<
    GroupActionState | undefined,
    FormData
  >(bound, undefined);

  const [cash, setCash] = useState(cashTargetPercent);
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(portfolios.map((p) => [p.id, p.targetPercentInGroup])),
  );

  const sum =
    Number(cash || 0) +
    portfolios.reduce((acc, p) => acc + Number(values[p.id] || 0), 0);

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
              <th className="label px-3 py-3 text-right">Target %</th>
            </tr>
          </thead>
          <tbody>
            {portfolios.length === 0 ? (
              <tr>
                <td
                  colSpan={2}
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
                      name="portfolioTargetPercent"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      required
                      value={values[p.id] ?? ""}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [p.id]: e.target.value }))
                      }
                      className="hairline tabular w-24 bg-surface px-2 py-1 text-right text-sm"
                    />
                  </td>
                </tr>
              ))
            )}
            <tr className="bg-surface">
              <td className="px-3 py-3 text-foreground">Cash</td>
              <td className="px-3 py-3 text-right">
                <input
                  name="cashTargetPercent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  required
                  value={cash}
                  onChange={(e) => setCash(e.target.value)}
                  className="hairline tabular w-24 bg-surface px-2 py-1 text-right text-sm"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <SumToHundredIndicator sum={sum} />
        <div className="flex items-center gap-3">
          <Link
            href={`/groups/${groupId}`}
            className="px-4 py-2 text-sm text-muted hover:text-foreground"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={pending || Math.abs(sum - 100) > 0.0001}
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

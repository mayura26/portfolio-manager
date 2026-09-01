import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CashTransactionForm } from "@/components/groups/cash-transaction-form";
import { DeleteCashButton } from "@/components/groups/delete-cash-button";
import { ExternalCashImportForm } from "@/components/groups/external-cash-import-form";
import { Skeleton } from "@/components/shared/skeleton";
import { computeGroupCash } from "@/lib/cash";
import { db } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";

type Params = Promise<{ groupId: string }>;

export default function GroupCashPage({
  params,
}: PageProps<"/groups/[groupId]/cash">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <GroupCash params={params} />
    </Suspense>
  );
}

async function GroupCash({ params }: { params: Params }) {
  const { groupId } = await params;
  const group = await db.portfolioGroup.findUnique({ where: { id: groupId } });
  if (!group) notFound();

  const cash = await computeGroupCash(groupId);

  return (
    <div className="mx-auto max-w-6xl">
      <nav className="label mb-6">
        <Link href="/groups" className="text-muted hover:text-foreground">
          Groups
        </Link>{" "}
        /{" "}
        <Link
          href={`/groups/${groupId}`}
          className="text-muted hover:text-foreground"
        >
          {group.name}
        </Link>{" "}
        / Cash
      </nav>

      <header className="mb-8 border-b border-border pb-6">
        <p className="label">Cash-like assets · {cash.baseCurrency}</p>
        <h1 className="display mt-2 text-4xl text-foreground">
          {formatCurrency(cash.currentCash.toString(), cash.baseCurrency)}
        </h1>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="hairline bg-surface px-4 py-3">
            <p className="label">Pure cash</p>
            <p className="display tabular mt-2 text-xl text-foreground">
              {formatCurrency(cash.pureCash.toString(), cash.baseCurrency)}
            </p>
          </div>
          <div className="hairline bg-surface px-4 py-3">
            <p className="label">HISA</p>
            <p className="display tabular mt-2 text-xl text-foreground">
              {formatCurrency(
                cash.cashInvestments.toString(),
                cash.baseCurrency,
              )}
            </p>
          </div>
        </div>
        {cash.byCurrency.length > 0 && (
          <p className="mt-2 text-sm text-muted">
            {cash.byCurrency.map((b, i) => (
              <span key={b.currency}>
                {i > 0 && <span className="text-subtle"> · </span>}
                {formatCurrency(b.balance.toString(), b.currency)}
                {b.currency !== cash.baseCurrency && (
                  <span className="text-subtle">
                    {" "}
                    ≈{" "}
                    {formatCurrency(b.baseValue.toString(), cash.baseCurrency)}
                  </span>
                )}
              </span>
            ))}
            <span className="text-subtle"> · @ today's FX</span>
          </p>
        )}
        {cash.byVehicle.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
            {cash.byVehicle.map((vehicle) => (
              <span key={vehicle.key}>
                {vehicle.label}:{" "}
                {formatCurrency(vehicle.balance.toString(), vehicle.currency)}
                {vehicle.currency !== cash.baseCurrency ? (
                  <span className="text-subtle">
                    {" "}
                    ≈{" "}
                    {formatCurrency(
                      vehicle.baseValue.toString(),
                      cash.baseCurrency,
                    )}
                  </span>
                ) : null}
                {vehicle.kind === "HISA" &&
                !vehicle.realizedIncomeBase.isZero() ? (
                  <span className="text-gain">
                    {" "}
                    · interest{" "}
                    {formatCurrency(
                      vehicle.realizedIncomeBase.toString(),
                      cash.baseCurrency,
                      { signed: true },
                    )}
                  </span>
                ) : null}
              </span>
            ))}
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
          <span>
            Seeded + deposits:{" "}
            {formatCurrency(
              cash.seededAndDeposits.toString(),
              cash.baseCurrency,
            )}
          </span>
          <span>
            Dividend + interest income:{" "}
            {formatCurrency(cash.realizedIncome.toString(), cash.baseCurrency, {
              signed: true,
            })}
          </span>
          <span>
            Withdrawals:{" "}
            {formatCurrency(cash.withdrawals.toString(), cash.baseCurrency)}
          </span>
          <span>
            Trade outflows (BUY):{" "}
            {formatCurrency(cash.tradeOutflows.toString(), cash.baseCurrency)}
          </span>
          <span>
            Trade inflows (SELL):{" "}
            {formatCurrency(cash.tradeInflows.toString(), cash.baseCurrency)}
          </span>
        </div>
      </header>

      <section className="mb-8">
        <h2 className="display mb-3 text-2xl text-foreground">
          Record cash movement
        </h2>
        <CashTransactionForm
          groupId={groupId}
          defaultCurrency={group.baseCurrency}
        />
      </section>

      <section className="mb-8">
        <h2 className="display mb-3 text-2xl text-foreground">
          Import external cash statement
        </h2>
        <ExternalCashImportForm groupId={groupId} statementCurrency="AUD" />
      </section>

      <section>
        <h2 className="display mb-3 text-2xl text-foreground">Ledger</h2>
        <div className="hairline overflow-x-auto bg-surface-elevated">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="label px-3 py-3">Date</th>
                <th className="label px-3 py-3">Type</th>
                <th className="label px-3 py-3">Vehicle</th>
                <th className="label px-3 py-3 text-right">Amount</th>
                <th className="label px-3 py-3 text-right">
                  In {cash.baseCurrency}
                </th>
                <th className="label px-3 py-3">Notes</th>
                <th className="label px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {cash.ledger.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-8 text-center text-sm text-muted"
                  >
                    No cash movements yet. Seed the group to get started.
                  </td>
                </tr>
              ) : (
                cash.ledger.toReversed().map((e) => (
                  <tr
                    key={`${e.kind}-${e.id}`}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="px-3 py-3 tabular text-muted">
                      {formatDate(e.date)}
                    </td>
                    <td className="px-3 py-3">
                      <span className="label">{e.type}</span>
                      <div className="mt-1 text-xs text-subtle">
                        {cashSourceLabel(e)}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-muted">
                      {e.vehicleKind === "HISA" ? (
                        <span className="text-gain">{e.vehicleLabel}</span>
                      ) : (
                        e.vehicleLabel
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular">
                      {formatCurrency(e.amountCurrency.toString(), e.currency)}
                    </td>
                    <td
                      className={`px-3 py-3 text-right tabular ${
                        Number(e.amountBase.toString()) >= 0
                          ? "text-gain"
                          : "text-loss"
                      }`}
                    >
                      {formatCurrency(
                        e.amountBase.toString(),
                        cash.baseCurrency,
                        { signed: true },
                      )}
                    </td>
                    <td className="px-3 py-3 text-muted">{e.notes ?? "—"}</td>
                    <td className="px-3 py-3 text-right">
                      {e.kind === "transaction" ? (
                        <DeleteCashButton transactionId={e.id} />
                      ) : (
                        <span className="text-xs text-subtle">
                          trade-driven
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function cashSourceLabel(e: {
  kind: "transaction" | "trade";
  source: string | null;
  sourceAccountKey: string | null;
}): string {
  if (e.kind === "trade") return "trade-driven";
  if (e.source === "EXTERNAL_STATEMENT") {
    const account = e.sourceAccountKey?.split(":").at(-1)?.slice(-4);
    return account ? `external statement - ${account}` : "external statement";
  }
  if (e.source === "IBKR") return "IBKR sync";
  return "manual";
}

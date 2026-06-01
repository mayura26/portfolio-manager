import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { parseExternalCashStatementPdf } from "@/lib/import/external-cash-parser";

export type ExternalCashImportResult = {
  imported: number;
  skipped: number;
  reconciliationDelta: string;
  statementEndingBalance: string;
  accountLast4: string;
};

export async function importExternalCashStatement(
  file: File,
  groupId: string,
): Promise<ExternalCashImportResult> {
  const group = await db.portfolioGroup.findUnique({
    where: { id: groupId },
    select: { id: true },
  });
  if (!group) throw new Error("Portfolio group not found.");

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  const parsed = await parseExternalCashStatementPdf(buffer);

  const existingImport = await db.cashStatementImport.findUnique({
    where: {
      groupId_fileHash: {
        groupId,
        fileHash,
      },
    },
  });

  if (existingImport) {
    return {
      imported: 0,
      skipped: parsed.transactions.length,
      reconciliationDelta: existingImport.reconciliationDelta.toString(),
      statementEndingBalance: parsed.endingBalance,
      accountLast4: parsed.accountLast4,
    };
  }

  return db.$transaction(async (tx) => {
    const statementImport = await tx.cashStatementImport.create({
      data: {
        groupId,
        provider: parsed.provider,
        accountLast4: parsed.accountLast4,
        sourceAccountKey: parsed.sourceAccountKey,
        accountType: parsed.accountType,
        periodStart: parsed.periodStart,
        periodEnd: parsed.periodEnd,
        statementGeneratedAt: parsed.statementGeneratedAt,
        currency: parsed.currency,
        endingBalance: parsed.endingBalance,
        filename: file.name,
        fileHash,
      },
    });

    const rows = parsed.transactions.map((statementTx) => ({
      groupId,
      type: statementTx.type,
      amount: statementTx.amount,
      currency: parsed.currency,
      date: statementTx.date,
      notes: statementTx.description,
      externalRef: statementTx.externalRef,
      source: "EXTERNAL_STATEMENT" as const,
      sourceAccountKey: parsed.sourceAccountKey,
      statementImportId: statementImport.id,
    }));

    const created = await tx.cashTransaction.createMany({
      data: rows,
      skipDuplicates: true,
    });

    const skipped = parsed.transactions.length - created.count;

    const existingAccountTxs = await tx.cashTransaction.findMany({
      where: {
        groupId,
        source: "EXTERNAL_STATEMENT",
        sourceAccountKey: parsed.sourceAccountKey,
        date: { lte: endOfUtcDay(parsed.periodEnd) },
      },
      select: {
        type: true,
        amount: true,
        currency: true,
      },
    });

    const knownBalance = existingAccountTxs.reduce((sum, row) => {
      if (row.currency !== parsed.currency) return sum;
      const amount = new Decimal(row.amount.toString());
      // INTEREST and DEPOSIT/SEED are all inflows; only WITHDRAWAL is an outflow.
      return row.type === "WITHDRAWAL" ? sum.minus(amount) : sum.plus(amount);
    }, new Decimal(0));

    const endingBalance = new Decimal(parsed.endingBalance);
    const reconciliationDelta = endingBalance.minus(knownBalance);
    const hasPriorAccountTx = await tx.cashTransaction.findFirst({
      where: {
        groupId,
        source: "EXTERNAL_STATEMENT",
        sourceAccountKey: parsed.sourceAccountKey,
        statementImportId: { not: statementImport.id },
      },
      select: { id: true },
    });

    if (!reconciliationDelta.abs().lt(new Decimal("0.0001"))) {
      const type = !hasPriorAccountTx
        ? "SEED"
        : reconciliationDelta.gt(0)
          ? "DEPOSIT"
          : "WITHDRAWAL";
      const amount = reconciliationDelta.abs();
      await tx.cashTransaction.create({
        data: {
          groupId,
          type,
          amount: amount.toFixed(4),
          currency: parsed.currency,
          date: parsed.periodStart,
          notes: `Reconciliation adjustment for ${parsed.provider} account ending ${parsed.accountLast4}`,
          externalRef: fingerprint(
            "reconcile",
            parsed.sourceAccountKey,
            parsed.periodEnd.toISOString(),
            parsed.endingBalance,
          ),
          source: "EXTERNAL_STATEMENT",
          sourceAccountKey: parsed.sourceAccountKey,
          statementImportId: statementImport.id,
        },
      });
    }

    await tx.cashStatementImport.update({
      where: { id: statementImport.id },
      data: {
        importInserted: created.count,
        importSkipped: skipped,
        reconciliationDelta: reconciliationDelta.toFixed(4),
      },
    });

    return {
      imported: created.count,
      skipped,
      reconciliationDelta: reconciliationDelta.toFixed(4),
      statementEndingBalance: parsed.endingBalance,
      accountLast4: parsed.accountLast4,
    };
  });
}

function endOfUtcDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

function fingerprint(...parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

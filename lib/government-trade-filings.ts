import type { Prisma } from "@/app/generated/prisma/client";
import { db } from "@/lib/db";

export const GOVERNMENT_FILING_SOURCES = {
  housePtr: "house-ptr",
  oge278T: "oge-278t",
} as const;

export type GovernmentFilingSource =
  (typeof GOVERNMENT_FILING_SOURCES)[keyof typeof GOVERNMENT_FILING_SOURCES];

export async function getProcessedGovernmentFilingIds(
  source: GovernmentFilingSource,
  docIds: string[],
): Promise<Set<string>> {
  if (docIds.length === 0) return new Set();

  const rows = await db.governmentTradeFiling.findMany({
    where: { source, docId: { in: docIds } },
    select: { docId: true },
  });

  return new Set(rows.map((row) => row.docId));
}

export async function markGovernmentFilingProcessed(opts: {
  source: GovernmentFilingSource;
  docId: string;
  filer?: string | null;
  filedAt?: Date | null;
  transactionCount: number;
  metadata?: Prisma.InputJsonObject;
}) {
  const processedAt = new Date();

  await db.governmentTradeFiling.upsert({
    where: {
      source_docId: {
        source: opts.source,
        docId: opts.docId,
      },
    },
    update: {
      filer: opts.filer ?? undefined,
      filedAt: opts.filedAt ?? undefined,
      processedAt,
      transactionCount: opts.transactionCount,
      metadata: opts.metadata,
    },
    create: {
      source: opts.source,
      docId: opts.docId,
      filer: opts.filer ?? undefined,
      filedAt: opts.filedAt ?? undefined,
      processedAt,
      transactionCount: opts.transactionCount,
      metadata: opts.metadata,
    },
  });
}

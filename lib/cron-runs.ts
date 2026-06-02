import type { Prisma } from "@/app/generated/prisma/client";
import { db } from "@/lib/db";

export type CronJobName =
  | "prices"
  | "fx-rates"
  | "alerts"
  | "forecasts"
  | "ibkr-sync"
  | "autowatcher"
  | "weekly-report"
  | "congress-trades";

type RecordCronRunOptions<T> = {
  job: CronJobName;
  command: string;
  run: () => Promise<T>;
  ok?: (result: T) => boolean;
  warnings?: (result: T) => number;
  summary?: (result: T) => Prisma.InputJsonObject;
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function recordCronRun<T>({
  job,
  command,
  run,
  ok: isOk,
  warnings,
  summary,
}: RecordCronRunOptions<T>): Promise<{
  runId: string;
  result: T;
  warnings: number;
}> {
  const row = await db.cronJobRun.create({
    data: { job, command },
  });

  try {
    const result = await run();
    const ok = optionsOk(result, isOk);
    const warningCount = warnings?.(result) ?? 0;

    await db.cronJobRun.update({
      where: { id: row.id },
      data: {
        finishedAt: new Date(),
        ok,
        warnings: warningCount,
        summary: summary?.(result),
      },
    });

    return { runId: row.id, result, warnings: warningCount };
  } catch (err) {
    await db.cronJobRun.update({
      where: { id: row.id },
      data: {
        finishedAt: new Date(),
        ok: false,
        error: errorMessage(err),
      },
    });
    throw err;
  }
}

function optionsOk<T>(
  result: T,
  predicate: ((result: T) => boolean) | undefined,
): boolean {
  return predicate ? predicate(result) : true;
}

/**
 * Combined trades cron — the single scheduled task that runs every trade-data
 * source in sequence (House congress PTRs, Senate PTRs, SEC Form 4 insider, and
 * executive OGE 278-T) and records ONE "trades" CronJobRun summarizing them all.
 * Coolify only needs this one scheduled task: "npm run cron:trades".
 *
 * One source failing does not abort the others; the run is marked not-ok (and
 * the process exits non-zero) if any source failed.
 */
import "dotenv/config";
import { runCongressSync } from "@/lib/congress-trades";
import { recordCronRun } from "@/lib/cron-runs";
import { db } from "@/lib/db";
import { runInsiderSync } from "@/lib/insider-trades";
import { runExecutiveSync } from "@/lib/oge-trades";
import { runSenateSync } from "@/lib/senate-trades";

async function runSource<T extends { ok: boolean; inserted: number }>(
  label: string,
  fn: () => Promise<T>,
): Promise<{ label: string; ok: boolean; inserted: number | string }> {
  try {
    const r = await fn();
    console.log(`[cron-trades] ${label}: inserted=${r.inserted} ok=${r.ok}`);
    return { label, ok: r.ok, inserted: r.inserted };
  } catch (err) {
    console.error(`[cron-trades] ${label} failed`, err);
    return { label, ok: false, inserted: "error" };
  }
}

type TradesResult = {
  ok: boolean;
  summary: Record<string, number | string | boolean>;
};

async function runAllTrades(): Promise<TradesResult> {
  const sources = [
    await runSource("congress", () => runCongressSync("cron")),
    await runSource("senate", () => runSenateSync("cron")),
    await runSource("insider", () => runInsiderSync("cron")),
    await runSource("executive", () => runExecutiveSync("cron")),
  ];
  const ok = sources.every((s) => s.ok);
  const summary: Record<string, number | string | boolean> = { ok };
  for (const s of sources) summary[s.label] = s.inserted;
  return { ok, summary };
}

recordCronRun({
  job: "trades",
  command: "npm run cron:trades",
  run: runAllTrades,
  ok: (r) => r.ok,
  warnings: (r) => (r.ok ? 0 : 1),
  summary: (r) => r.summary,
})
  .then(({ result }) => {
    console.log(JSON.stringify(result.summary, null, 2));
    process.exit(result.ok ? 0 : 1);
  })
  .catch((err) => {
    console.error("[cron-trades] fatal", err);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });

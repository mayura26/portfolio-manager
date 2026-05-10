"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ImportResult } from "@/lib/import/ibkr-engine";
import { ImportResultDisplay } from "./import-result";

type Portfolio = { id: string; name: string };

type Props = {
  portfolios: Portfolio[];
};

type ApiResponse =
  | ({ ok: true; message?: string } & ImportResult)
  | { ok: false; error: string };

export function CsvImportSection({ portfolios }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ApiResponse | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResult(null);

    const form = e.currentTarget;
    const portfolioId = (
      form.elements.namedItem("portfolioId") as HTMLSelectElement
    ).value;
    const file = fileRef.current?.files?.[0];

    if (!portfolioId) {
      setResult({ ok: false, error: "Please select a portfolio." });
      return;
    }
    if (!file) {
      setResult({ ok: false, error: "Please select a CSV file." });
      return;
    }

    const formData = new FormData();
    formData.append("portfolioId", portfolioId);
    formData.append("file", file);

    startTransition(async () => {
      try {
        const res = await fetch("/api/import/ibkr", {
          method: "POST",
          body: formData,
        });
        const data: ApiResponse = await res.json();
        setResult(data);
        if (data.ok) {
          router.refresh();
          if (fileRef.current) fileRef.current.value = "";
        }
      } catch {
        setResult({ ok: false, error: "Network error — please try again." });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="csv-portfolioId" className="label">
          Portfolio
        </label>
        <select
          id="csv-portfolioId"
          name="portfolioId"
          required
          className="hairline w-full bg-surface px-3 py-2 text-sm text-foreground"
        >
          <option value="">— select a portfolio —</option>
          {portfolios.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="csv-file" className="label">
          Activity Statement CSV
        </label>
        <input
          ref={fileRef}
          id="csv-file"
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
          className="hairline w-full bg-surface px-3 py-2 text-sm text-foreground file:mr-4 file:border-0 file:bg-transparent file:text-sm file:text-muted"
        />
        <p className="text-xs text-subtle">
          Download from IBKR: Reports → Activity → Activity Statement, set
          format to CSV.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="bg-accent px-4 py-2 text-sm text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {isPending ? "Importing…" : "Import trades"}
        </button>
      </div>

      {result ? (
        result.ok ? (
          <div className="flex flex-col gap-3">
            {result.message ? (
              <p className="text-sm text-muted">{result.message}</p>
            ) : (
              <ImportResultDisplay result={result} />
            )}
          </div>
        ) : (
          <div
            className="hairline border-loss/40 bg-loss-soft px-4 py-3 text-sm text-loss"
            role="alert"
          >
            {result.error}
          </div>
        )
      ) : null}
    </form>
  );
}

"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { formatCurrency } from "@/lib/format";

type Props = {
  groupId: string;
  statementCurrency: string;
};

type ImportResponse =
  | {
      ok: true;
      imported: number;
      skipped: number;
      reconciliationDelta: string;
      statementEndingBalance: string;
      accountLast4: string;
    }
  | { ok: false; error: string };

export function ExternalCashImportForm({ groupId, statementCurrency }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportResponse | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResult(null);

    const file = fileRef.current?.files?.[0];
    if (!file) {
      setResult({ ok: false, error: "Please select a PDF statement." });
      return;
    }

    const formData = new FormData();
    formData.append("groupId", groupId);
    formData.append("file", file);

    startTransition(async () => {
      try {
        const response = await fetch("/api/import/external-cash", {
          method: "POST",
          body: formData,
        });
        const data: ImportResponse = await response.json();
        setResult(data);
        if (data.ok) {
          router.refresh();
          if (fileRef.current) fileRef.current.value = "";
        }
      } catch {
        setResult({ ok: false, error: "Network error. Please try again." });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="hairline bg-surface p-4">
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <div className="flex flex-col gap-2">
          <label htmlFor="external-cash-file" className="label">
            CommBank Transaction Summary PDF
          </label>
          <input
            ref={fileRef}
            id="external-cash-file"
            name="file"
            type="file"
            accept="application/pdf,.pdf"
            required
            className="hairline w-full bg-surface px-3 py-2 text-sm text-foreground file:mr-4 file:border-0 file:bg-transparent file:text-sm file:text-muted"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center justify-center gap-2 bg-accent px-4 py-2 text-sm text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          <Upload className="size-4" aria-hidden />
          {isPending ? "Importing..." : "Import statement"}
        </button>
      </div>

      {result ? (
        result.ok ? (
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-3 text-sm">
            <span className="text-gain">
              <strong>{result.imported}</strong> cash row
              {result.imported !== 1 ? "s" : ""} imported
            </span>
            {result.skipped > 0 ? (
              <span className="text-muted">
                <strong>{result.skipped}</strong> skipped
              </span>
            ) : null}
            <span className="text-muted">
              Account ending {result.accountLast4}:{" "}
              {formatCurrency(result.statementEndingBalance, statementCurrency)}
            </span>
            <span
              className={
                Number(result.reconciliationDelta) === 0
                  ? "text-muted"
                  : "text-gain"
              }
            >
              Reconciliation:{" "}
              {formatCurrency(result.reconciliationDelta, statementCurrency, {
                signed: true,
              })}
            </span>
          </div>
        ) : (
          <div
            className="mt-4 hairline border-loss/40 bg-loss-soft px-4 py-3 text-sm text-loss"
            role="alert"
          >
            {result.error}
          </div>
        )
      ) : null}
    </form>
  );
}

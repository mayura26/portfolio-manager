"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { saveUserForecast } from "@/actions/forecasts";

type Props = {
  instrumentId: string;
};

type Extracted = {
  targetPrice: number | null;
  lowCase: number | null;
  highCase: number | null;
  expectedReturn: number | null;
  horizonMonths: number;
  rationale: string;
  confidence: number;
  extractedNotes: string;
};

type UploadResponse =
  | {
      ok: true;
      documentId: string;
      currentPrice: number | null;
      extracted: Extracted;
    }
  | { ok: false; error: string };

export function ForecastUpload({ instrumentId }: Props) {
  const router = useRouter();
  const [isUploading, startUpload] = useTransition();
  const [isSaving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<
    (Extracted & { documentId: string; currentPrice: number | null }) | null
  >(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPreview(null);

    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Please select a file.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    startUpload(async () => {
      try {
        const res = await fetch(
          `/api/instruments/${instrumentId}/analysis/upload`,
          { method: "POST", body: formData },
        );
        const data: UploadResponse = await res.json();
        if (!data.ok) {
          setError(data.error);
          return;
        }
        setPreview({
          ...data.extracted,
          documentId: data.documentId,
          currentPrice: data.currentPrice,
        });
      } catch {
        setError("Network error — please try again.");
      }
    });
  }

  function handleConfirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!preview) return;
    setError(null);

    const form = e.currentTarget;
    const get = (name: string) =>
      (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement)
        .value;

    const targetPrice = Number(get("targetPrice"));
    const lowCase = get("lowCase") === "" ? null : Number(get("lowCase"));
    const highCase = get("highCase") === "" ? null : Number(get("highCase"));
    const expectedReturn =
      get("expectedReturn") === "" ? null : Number(get("expectedReturn"));
    const horizonMonths = Number(get("horizonMonths"));
    const rationale = get("rationale").trim();

    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
      setError("Target price must be a positive number.");
      return;
    }
    if (!rationale) {
      setError("Rationale is required.");
      return;
    }

    startSave(async () => {
      const result = await saveUserForecast({
        instrumentId,
        targetPrice,
        lowCase: lowCase != null && Number.isFinite(lowCase) ? lowCase : null,
        highCase:
          highCase != null && Number.isFinite(highCase) ? highCase : null,
        expectedReturn:
          expectedReturn != null && Number.isFinite(expectedReturn)
            ? expectedReturn
            : null,
        horizonMonths: Number.isFinite(horizonMonths) ? horizonMonths : 12,
        rationale,
        documentId: preview.documentId,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <div className="hairline flex flex-col gap-4 bg-surface px-5 py-5">
      <div>
        <h3 className="text-sm font-medium text-foreground">
          Upload your analysis
        </h3>
        <p className="mt-1 text-xs text-muted">
          PDF, Markdown, or text up to 5&nbsp;MB. Your forecast is preserved —
          weekly AI runs won't overwrite it.
        </p>
      </div>

      {!preview ? (
        <form onSubmit={handleUpload} className="flex flex-col gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.md,.markdown,.txt,application/pdf,text/markdown,text/plain"
            className="hairline w-full bg-surface px-3 py-2 text-sm text-foreground file:mr-4 file:border-0 file:bg-transparent file:text-sm file:text-muted"
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isUploading}
              className="bg-accent px-4 py-2 text-sm text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {isUploading ? "Extracting…" : "Extract forecast"}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleConfirm} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-subtle">
            <span>
              Confidence:&nbsp;
              <span className="tabular text-foreground">
                {(preview.confidence * 100).toFixed(0)}%
              </span>
            </span>
            {preview.currentPrice != null ? (
              <span>
                · Current price:&nbsp;
                <span className="tabular text-foreground">
                  {preview.currentPrice.toFixed(2)}
                </span>
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <NumField
              label="Target"
              name="targetPrice"
              defaultValue={preview.targetPrice}
              required
            />
            <NumField
              label="Bear case"
              name="lowCase"
              defaultValue={preview.lowCase}
            />
            <NumField
              label="Bull case"
              name="highCase"
              defaultValue={preview.highCase}
            />
            <NumField
              label="Expected return (%)"
              name="expectedReturn"
              defaultValue={preview.expectedReturn}
              step="0.01"
            />
            <NumField
              label="Horizon (months)"
              name="horizonMonths"
              defaultValue={preview.horizonMonths}
              step="1"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="label" htmlFor="rationale">
              Rationale
            </label>
            <textarea
              id="rationale"
              name="rationale"
              defaultValue={preview.rationale}
              rows={4}
              required
              className="hairline w-full bg-surface px-3 py-2 text-sm text-foreground"
            />
          </div>

          {preview.extractedNotes ? (
            <p className="text-xs text-subtle">
              Notes: {preview.extractedNotes}
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isSaving}
              className="bg-accent px-4 py-2 text-sm text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Save as my forecast"}
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              disabled={isSaving}
              className="px-4 py-2 text-sm text-muted hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error ? (
        <div
          className="hairline border-loss/40 bg-loss-soft px-4 py-3 text-sm text-loss"
          role="alert"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}

function NumField({
  label,
  name,
  defaultValue,
  step,
  required,
}: {
  label: string;
  name: string;
  defaultValue: number | null;
  step?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="label">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="number"
        inputMode="decimal"
        step={step ?? "any"}
        defaultValue={defaultValue ?? ""}
        required={required}
        className="hairline w-full bg-surface px-3 py-2 text-sm tabular text-foreground"
      />
    </div>
  );
}

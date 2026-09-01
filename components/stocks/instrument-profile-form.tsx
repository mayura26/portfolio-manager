"use client";

import { Save, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import {
  generateInstrumentProfile,
  updateInstrumentProfile,
} from "@/actions/instruments";
import {
  INSTRUMENT_TYPE_OPTIONS,
  instrumentTypeLabel,
  isInstrumentTypeOption,
} from "@/lib/instrument-types";

type Props = {
  instrument: {
    id: string;
    sector: string | null;
    industry: string | null;
    instrumentType: string;
  };
};

export function InstrumentProfileForm({ instrument }: Props) {
  const saveProfile = updateInstrumentProfile.bind(null, instrument.id);
  const currentType = instrument.instrumentType || "EQUITY";
  const [sector, setSector] = useState(instrument.sector ?? "");
  const [industry, setIndustry] = useState(instrument.industry ?? "");
  const [instrumentType, setInstrumentType] = useState(currentType);
  const [rationale, setRationale] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const hasCustomType = !isInstrumentTypeOption(instrumentType);

  return (
    <form
      action={saveProfile}
      className="hairline grid gap-4 bg-surface p-4 md:grid-cols-[1fr_1fr_12rem_auto]"
    >
      <div className="md:col-span-4">
        <h2 className="label text-foreground">Profile data</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Sector is stored on the instrument profile and feeds sector exposure.
          Yahoo fills it when a symbol is first added, but ETFs, funds,
          commodity products, and sparse profiles often arrive blank.
        </p>
      </div>

      <label className="flex min-w-0 flex-col gap-1">
        <span className="label text-[10px]">Sector / bucket</span>
        <input
          name="sector"
          value={sector}
          onChange={(event) => setSector(event.target.value)}
          maxLength={100}
          placeholder="Technology"
          className="h-10 border border-border bg-surface-elevated px-3 text-sm text-foreground placeholder:text-subtle"
        />
      </label>

      <label className="flex min-w-0 flex-col gap-1">
        <span className="label text-[10px]">Industry</span>
        <input
          name="industry"
          value={industry}
          onChange={(event) => setIndustry(event.target.value)}
          maxLength={150}
          placeholder="Semiconductors"
          className="h-10 border border-border bg-surface-elevated px-3 text-sm text-foreground placeholder:text-subtle"
        />
      </label>

      <label className="flex min-w-0 flex-col gap-1">
        <span className="label text-[10px]">Type</span>
        <select
          name="instrumentType"
          value={instrumentType}
          onChange={(event) => setInstrumentType(event.target.value)}
          className="h-10 border border-border bg-surface-elevated px-3 text-sm text-foreground"
        >
          {hasCustomType ? (
            <option value={instrumentType}>{instrumentType}</option>
          ) : null}
          {INSTRUMENT_TYPE_OPTIONS.map((type) => (
            <option key={type} value={type}>
              {instrumentTypeLabel(type)}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-2 self-end">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setAiError(null);
            setRationale(null);
            startTransition(async () => {
              const result = await generateInstrumentProfile(instrument.id);
              if (!result.ok) {
                setAiError(result.error);
                return;
              }
              setSector(result.draft.sector);
              setIndustry(result.draft.industry);
              setInstrumentType(result.draft.instrumentType);
              setRationale(result.draft.rationale);
            });
          }}
          className="inline-flex h-10 items-center justify-center gap-2 border border-border bg-surface-elevated px-3 text-sm font-medium text-foreground transition-colors hover:border-border-strong disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          {pending ? "Generating" : "Generate"}
        </button>

        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center gap-2 border border-accent bg-accent px-3 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          <Save className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          Save
        </button>
      </div>

      {rationale || aiError ? (
        <p
          className={`md:col-span-4 text-xs ${
            aiError ? "text-loss" : "text-muted"
          }`}
        >
          {aiError ?? `AI draft: ${rationale}`}
        </p>
      ) : null}
    </form>
  );
}

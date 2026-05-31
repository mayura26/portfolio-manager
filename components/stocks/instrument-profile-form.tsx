import { Save } from "lucide-react";
import { updateInstrumentProfile } from "@/actions/instruments";

type Props = {
  instrument: {
    id: string;
    sector: string | null;
    industry: string | null;
    instrumentType: string;
  };
};

const INSTRUMENT_TYPE_OPTIONS = [
  "EQUITY",
  "ETF",
  "MUTUALFUND",
  "INDEX",
  "CRYPTOCURRENCY",
  "CURRENCY",
  "FUTURE",
  "OPTION",
  "OTHER",
];

export function InstrumentProfileForm({ instrument }: Props) {
  const saveProfile = updateInstrumentProfile.bind(null, instrument.id);
  const currentType = instrument.instrumentType || "EQUITY";
  const hasCustomType = !INSTRUMENT_TYPE_OPTIONS.includes(currentType);

  return (
    <form
      action={saveProfile}
      className="hairline mt-5 grid gap-4 bg-surface p-4 md:grid-cols-[1fr_1fr_12rem_auto]"
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
          defaultValue={instrument.sector ?? ""}
          maxLength={100}
          placeholder="Technology"
          className="h-10 border border-border bg-surface-elevated px-3 text-sm text-foreground placeholder:text-subtle"
        />
      </label>

      <label className="flex min-w-0 flex-col gap-1">
        <span className="label text-[10px]">Industry</span>
        <input
          name="industry"
          defaultValue={instrument.industry ?? ""}
          maxLength={150}
          placeholder="Semiconductors"
          className="h-10 border border-border bg-surface-elevated px-3 text-sm text-foreground placeholder:text-subtle"
        />
      </label>

      <label className="flex min-w-0 flex-col gap-1">
        <span className="label text-[10px]">Type</span>
        <select
          name="instrumentType"
          defaultValue={currentType}
          className="h-10 border border-border bg-surface-elevated px-3 text-sm text-foreground"
        >
          {hasCustomType ? (
            <option value={currentType}>{currentType}</option>
          ) : null}
          {INSTRUMENT_TYPE_OPTIONS.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        className="inline-flex h-10 items-center justify-center gap-2 self-end border border-accent bg-accent px-3 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
      >
        <Save className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        Save
      </button>
    </form>
  );
}

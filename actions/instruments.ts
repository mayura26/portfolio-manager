"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { generateInstrumentProfileDraft } from "@/lib/instrument-profile-ai";
import { stockNoteSchema } from "@/lib/validators";

export type AutoWatcherActionState =
  | { ok: true }
  | { ok: false; error: string };

export async function setAutoWatcher(
  instrumentId: string,
  enabled: boolean,
  threshold?: number,
): Promise<AutoWatcherActionState> {
  const instrument = await db.instrument.findUnique({
    where: { id: instrumentId },
    select: { id: true, yahooSymbol: true },
  });
  if (!instrument) return { ok: false, error: "Instrument not found" };

  const thresholdValue =
    threshold !== undefined && threshold > 0 && threshold <= 100
      ? threshold
      : undefined;

  await db.instrument.update({
    where: { id: instrumentId },
    data: {
      autoWatcherEnabled: enabled,
      ...(thresholdValue !== undefined
        ? { autoWatcherThreshold: thresholdValue.toString() }
        : {}),
      // Reset state when toggling on or changing threshold so next cron
      // starts fresh without firing a storm of stale milestone alerts
      autoWatcherLastBand: null,
      autoWatcherLastDailyAt: null,
    },
  });

  revalidatePath("/stocks");
  revalidatePath(`/stocks/${instrument.yahooSymbol}`);
  return { ok: true };
}

function profileText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function updateInstrumentProfile(
  instrumentId: string,
  formData: FormData,
): Promise<void> {
  const instrument = await db.instrument.findUnique({
    where: { id: instrumentId },
    select: { id: true, yahooSymbol: true },
  });
  if (!instrument) throw new Error("Instrument not found");

  const sector = profileText(formData.get("sector"));
  const industry = profileText(formData.get("industry"));
  const instrumentType =
    profileText(formData.get("instrumentType"))?.toUpperCase() ?? "EQUITY";

  if (sector && sector.length > 100) throw new Error("Sector is too long");
  if (industry && industry.length > 150)
    throw new Error("Industry is too long");
  if (instrumentType.length > 50) {
    throw new Error("Instrument type is too long");
  }

  await db.instrument.update({
    where: { id: instrument.id },
    data: { sector, industry, instrumentType },
  });

  revalidatePath("/stocks");
  revalidatePath(`/stocks/${instrument.yahooSymbol}`);
  revalidatePath("/reviews/audit");
  revalidatePath("/dashboard");
}

export type InstrumentProfileDraftActionState =
  | {
      ok: true;
      draft: {
        sector: string;
        industry: string;
        instrumentType: string;
        rationale: string;
      };
    }
  | { ok: false; error: string };

export async function generateInstrumentProfile(
  instrumentId: string,
): Promise<InstrumentProfileDraftActionState> {
  const instrument = await db.instrument.findUnique({
    where: { id: instrumentId },
    select: {
      id: true,
      symbol: true,
      yahooSymbol: true,
      name: true,
      exchange: true,
      currency: true,
      sector: true,
      industry: true,
      instrumentType: true,
    },
  });
  if (!instrument) return { ok: false, error: "Instrument not found" };

  try {
    const draft = await generateInstrumentProfileDraft({
      symbol: instrument.symbol,
      yahooSymbol: instrument.yahooSymbol,
      name: instrument.name,
      exchange: instrument.exchange,
      currency: instrument.currency,
      currentSector: instrument.sector,
      currentIndustry: instrument.industry,
      currentInstrumentType: instrument.instrumentType,
    });
    return { ok: true, draft };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Could not generate profile data",
    };
  }
}

export type NoteActionState =
  | { ok: true; noteId?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

function revalidateInstrument(instrumentId: string, yahooSymbol: string) {
  revalidatePath("/stocks");
  revalidatePath(`/stocks/${yahooSymbol}`);
  revalidatePath(`/stocks/${yahooSymbol}/notes`);
  void instrumentId;
}

export async function createNote(
  _prev: NoteActionState | undefined,
  formData: FormData,
): Promise<NoteActionState> {
  const parsed = stockNoteSchema.safeParse({
    instrumentId: formData.get("instrumentId"),
    content: formData.get("content"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const instrument = await db.instrument.findUnique({
    where: { id: parsed.data.instrumentId },
    select: { id: true, yahooSymbol: true },
  });
  if (!instrument) return { ok: false, error: "Instrument not found" };

  const note = await db.stockNote.create({
    data: { instrumentId: instrument.id, content: parsed.data.content },
  });
  revalidateInstrument(instrument.id, instrument.yahooSymbol);
  return { ok: true, noteId: note.id };
}

export async function updateNote(
  noteId: string,
  _prev: NoteActionState | undefined,
  formData: FormData,
): Promise<NoteActionState> {
  const parsed = stockNoteSchema.safeParse({
    instrumentId: formData.get("instrumentId"),
    content: formData.get("content"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const existing = await db.stockNote.findUnique({
    where: { id: noteId },
    include: { instrument: { select: { yahooSymbol: true } } },
  });
  if (!existing) return { ok: false, error: "Note not found" };

  await db.stockNote.update({
    where: { id: noteId },
    data: { content: parsed.data.content },
  });
  revalidateInstrument(existing.instrumentId, existing.instrument.yahooSymbol);
  return { ok: true, noteId };
}

export async function deleteNote(noteId: string): Promise<void> {
  const existing = await db.stockNote.findUnique({
    where: { id: noteId },
    include: { instrument: { select: { yahooSymbol: true } } },
  });
  if (!existing) return;
  await db.stockNote.delete({ where: { id: noteId } });
  revalidateInstrument(existing.instrumentId, existing.instrument.yahooSymbol);
}

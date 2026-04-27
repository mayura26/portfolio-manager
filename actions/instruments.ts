"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { stockNoteSchema } from "@/lib/validators";

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

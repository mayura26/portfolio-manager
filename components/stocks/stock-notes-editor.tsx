"use client";

import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import {
  createNote,
  deleteNote,
  type NoteActionState,
  updateNote,
} from "@/actions/instruments";
import { formatRelative } from "@/lib/format";

type Note = {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
};

type Props = {
  instrumentId: string;
  notes: Note[];
};

export function StockNotesEditor({ instrumentId, notes }: Props) {
  const [composing, setComposing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      {composing ? (
        <NoteComposer
          instrumentId={instrumentId}
          onDone={() => setComposing(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="hairline inline-flex items-center justify-center gap-2 self-start bg-accent px-3 py-1.5 text-sm text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          Add note
        </button>
      )}

      {notes.length === 0 ? (
        <p className="text-sm text-muted">
          No notes yet. Use this space for thesis, watchpoints, and conviction.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {notes.map((note) =>
            editingId === note.id ? (
              <NoteEditor
                key={note.id}
                note={note}
                instrumentId={instrumentId}
                onDone={() => setEditingId(null)}
              />
            ) : (
              <NoteView
                key={note.id}
                note={note}
                onEdit={() => setEditingId(note.id)}
              />
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function NoteView({ note, onEdit }: { note: Note; onEdit: () => void }) {
  const [pending, startTransition] = useTransition();
  function handleDelete() {
    if (!window.confirm("Delete this note? This cannot be undone.")) return;
    startTransition(() => {
      void deleteNote(note.id);
    });
  }

  return (
    <li className="hairline bg-surface-elevated p-4">
      <div className="prose prose-sm max-w-none text-foreground">
        <ReactMarkdown>{note.content}</ReactMarkdown>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <p className="label">Updated {formatRelative(note.updatedAt)}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-muted hover:text-foreground"
          >
            <Pencil className="h-3 w-3" strokeWidth={1.5} aria-hidden />
            Edit
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-loss hover:underline disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" strokeWidth={1.5} aria-hidden />
            {pending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </li>
  );
}

function NoteComposer({
  instrumentId,
  onDone,
}: {
  instrumentId: string;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<
    NoteActionState | undefined,
    FormData
  >(createNote, undefined);

  if (state?.ok) {
    setTimeout(onDone, 0);
  }

  return (
    <form
      action={formAction}
      className="hairline flex flex-col gap-3 bg-surface p-4"
    >
      <input type="hidden" name="instrumentId" value={instrumentId} />
      <textarea
        name="content"
        rows={5}
        required
        maxLength={10000}
        placeholder="Markdown supported. Capture thesis, catalysts, exit triggers."
        className="hairline w-full bg-surface-elevated px-3 py-2 text-sm text-foreground"
      />
      {state && !state.ok ? (
        <p className="text-xs text-loss">{state.error}</p>
      ) : null}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-accent px-3 py-1.5 text-sm text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save note"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-muted hover:text-foreground"
        >
          <X className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          Cancel
        </button>
      </div>
    </form>
  );
}

function NoteEditor({
  note,
  instrumentId,
  onDone,
}: {
  note: Note;
  instrumentId: string;
  onDone: () => void;
}) {
  const action = updateNote.bind(null, note.id);
  const [state, formAction, pending] = useActionState<
    NoteActionState | undefined,
    FormData
  >(action, undefined);

  if (state?.ok) {
    setTimeout(onDone, 0);
  }

  return (
    <li>
      <form
        action={formAction}
        className="hairline flex flex-col gap-3 bg-surface p-4"
      >
        <input type="hidden" name="instrumentId" value={instrumentId} />
        <textarea
          name="content"
          rows={5}
          required
          maxLength={10000}
          defaultValue={note.content}
          className="hairline w-full bg-surface-elevated px-3 py-2 text-sm text-foreground"
        />
        {state && !state.ok ? (
          <p className="text-xs text-loss">{state.error}</p>
        ) : null}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="bg-accent px-3 py-1.5 text-sm text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-muted hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Cancel
          </button>
        </div>
      </form>
    </li>
  );
}

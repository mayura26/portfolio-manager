"use client";

import { format, parse } from "date-fns";
import { Calendar } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";

type Props = {
  name: string;
  defaultValue?: string; // yyyy-mm-dd
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
};

function parseIso(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = parse(value, "yyyy-MM-dd", new Date());
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function toIso(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function DatePicker({
  name,
  defaultValue,
  required,
  disabled,
  placeholder = "Pick a date",
}: Props) {
  const id = useId();
  const [selected, setSelected] = useState<Date | undefined>(
    parseIso(defaultValue),
  );
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      window.addEventListener("mousedown", onClick);
      window.addEventListener("keydown", onKey);
      return () => {
        window.removeEventListener("mousedown", onClick);
        window.removeEventListener("keydown", onKey);
      };
    }
  }, [open]);

  const value = selected ? toIso(selected) : "";
  const display = selected ? format(selected, "d MMM yyyy") : "";

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name={name} value={value} required={required} />

      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="hairline tabular flex w-full items-center justify-between gap-2 bg-surface px-3 py-2 text-left text-sm text-foreground hover:border-border-strong disabled:opacity-50"
      >
        <span className={display ? "" : "text-subtle"}>
          {display || placeholder}
        </span>
        <Calendar
          className="h-4 w-4 text-subtle"
          strokeWidth={1.5}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="dialog"
          className="hairline absolute left-0 top-full z-30 mt-1 bg-surface-elevated p-2 shadow-md"
        >
          <DayPicker
            mode="single"
            selected={selected}
            defaultMonth={selected}
            onSelect={(date) => {
              setSelected(date);
              if (date) setOpen(false);
            }}
            captionLayout="dropdown"
            showOutsideDays
          />
        </div>
      ) : null}
    </div>
  );
}

export type WeekRange = {
  /** Sunday, 00:00 UTC. */
  weekStart: Date;
  /** Saturday, 00:00 UTC. */
  weekEnd: Date;
};

function utcMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

/**
 * The most recent fully-completed Sunday→Saturday week before `now`.
 * Day-of-week is read in local time (the user's calendar week), then
 * pinned to UTC midnight so it round-trips cleanly through `@db.Date`.
 */
export function getPreviousWeekRange(now: Date = new Date()): WeekRange {
  const dayOfWeek = now.getDay(); // 0 = Sunday … 6 = Saturday
  // Sunday that opens the week containing `now`.
  const currentSunday = utcMidnight(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - dayOfWeek,
  );

  const weekStart = new Date(currentSunday);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);

  const weekEnd = new Date(currentSunday);
  weekEnd.setUTCDate(weekEnd.getUTCDate() - 1);

  return { weekStart, weekEnd };
}

/** Parse a `YYYY-MM-DD` string to a UTC-midnight Date. */
export function parseWeekStart(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return utcMidnight(year, month - 1, day);
}

/** UTC `YYYY-MM-DD` for a Date — the canonical key for a week. */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The Saturday that closes the week starting on `weekStart`. */
export function weekEndOf(weekStart: Date): Date {
  const end = new Date(weekStart);
  end.setUTCDate(end.getUTCDate() + 6);
  return end;
}

/** Exclusive upper bound (Sunday 00:00) for querying DateTime columns. */
export function weekEndExclusive(weekEnd: Date): Date {
  const next = new Date(weekEnd);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

/** Human label for a week, e.g. "10 May – 16 May 2026" (formatted in UTC). */
export function formatWeekRange(weekStart: Date, weekEnd: Date): string {
  const base: Intl.DateTimeFormatOptions = {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  };
  const start = weekStart.toLocaleDateString("en-GB", base);
  const end = weekEnd.toLocaleDateString("en-GB", {
    ...base,
    year: "numeric",
  });
  return `${start} – ${end}`;
}

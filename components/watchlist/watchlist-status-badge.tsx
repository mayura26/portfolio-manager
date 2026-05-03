type Status = "WATCHING" | "ARCHIVED" | "BOUGHT";

const STYLES: Record<Status, string> = {
  WATCHING: "border-info/40 bg-info/10 text-info",
  ARCHIVED: "border-border bg-surface text-subtle",
  BOUGHT: "border-gain/40 bg-gain/10 text-gain",
};

const LABELS: Record<Status, string> = {
  WATCHING: "Watching",
  ARCHIVED: "Archived",
  BOUGHT: "Bought",
};

export function WatchlistStatusBadge({ status }: { status: Status }) {
  return (
    <span className={`label inline-flex items-center border px-2 py-0.5 ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}

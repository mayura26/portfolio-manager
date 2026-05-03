type Status = "ACTIVE" | "TRIGGERED" | "SNOOZED" | "DISMISSED";

const STYLES: Record<Status, string> = {
  ACTIVE: "border-info/40 bg-info/10 text-info",
  TRIGGERED: "border-loss/40 bg-loss-soft text-loss",
  SNOOZED: "border-warning/40 bg-warning/10 text-warning",
  DISMISSED: "border-border bg-surface text-subtle",
};

const LABELS: Record<Status, string> = {
  ACTIVE: "Active",
  TRIGGERED: "Triggered",
  SNOOZED: "Snoozed",
  DISMISSED: "Dismissed",
};

export function AlertStatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`label inline-flex items-center border px-2 py-0.5 ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}

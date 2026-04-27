type Status = "PENDING" | "IN_PROGRESS" | "COMPLETED";

const STYLES: Record<Status, string> = {
  PENDING: "border-warning/40 bg-warning/10 text-warning",
  IN_PROGRESS: "border-info/40 bg-info/10 text-info",
  COMPLETED: "border-gain/40 bg-gain-soft text-gain",
};

const LABELS: Record<Status, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
};

export function ReviewStatusBadge({ status }: { status: Status }) {
  return (
    <span className={`label inline-flex items-center border px-2 py-0.5 ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}

import { formatRelative } from "@/lib/format";

type Finding = {
  rowKey: string;
  status: "on-target" | "underweight" | "overweight" | "concern";
  note: string;
};

type Analysis = {
  summary: string;
  perRowFindings: Finding[];
  rebalanceSuggestions: string[];
  suitabilityAssessment?: string;
  riskLevel?: "low" | "moderate" | "high" | "very-high";
  keyRiskDrivers?: string[];
  diversificationFeedback?: string;
  dataLimitations?: string[];
  generatedAt?: string;
};

type Props = {
  analysis: Analysis | null;
  generatedAt: Date | null;
  rowLabel: (rowKey: string) => string;
  emptyText?: string;
};

const STATUS_TONE: Record<Finding["status"], string> = {
  "on-target": "text-gain",
  underweight: "text-warning",
  overweight: "text-overweight",
  concern: "text-loss",
};

const STATUS_LABEL: Record<Finding["status"], string> = {
  "on-target": "On target",
  underweight: "Underweight",
  overweight: "Overweight",
  concern: "Concern",
};

export function CompositionPanel({
  analysis,
  generatedAt,
  rowLabel,
  emptyText,
}: Props) {
  if (!analysis) {
    return (
      <div className="hairline bg-surface px-5 py-6 text-sm text-muted">
        {emptyText ??
          "No AI composition analysis yet. Click Analyze composition to generate one."}
      </div>
    );
  }

  return (
    <div className="hairline flex flex-col gap-5 bg-surface px-5 py-5">
      <div>
        <p className="label">AI summary</p>
        <p className="mt-2 text-sm text-foreground">{analysis.summary}</p>
        {generatedAt ? (
          <p className="mt-2 text-xs text-subtle">
            Generated {formatRelative(generatedAt)}
          </p>
        ) : null}
      </div>

      {analysis.suitabilityAssessment ||
      analysis.riskLevel ||
      analysis.diversificationFeedback ? (
        <div className="grid gap-3 md:grid-cols-2">
          {analysis.suitabilityAssessment ? (
            <div className="hairline bg-surface-elevated px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="label">Suitability</p>
                {analysis.riskLevel ? (
                  <span className={`label ${riskTone(analysis.riskLevel)}`}>
                    {riskLabel(analysis.riskLevel)}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-muted">
                {analysis.suitabilityAssessment}
              </p>
            </div>
          ) : null}

          {analysis.diversificationFeedback ? (
            <div className="hairline bg-surface-elevated px-3 py-3">
              <p className="label">Composition</p>
              <p className="mt-2 text-sm text-muted">
                {analysis.diversificationFeedback}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {analysis.keyRiskDrivers?.length ? (
        <div>
          <p className="label">Risk drivers</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {analysis.keyRiskDrivers.map((driver) => (
              <li
                key={driver}
                className="hairline bg-surface-elevated px-2 py-1 text-xs text-muted"
              >
                {driver}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {analysis.perRowFindings.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="label">Per-row findings</p>
          <ul className="flex flex-col gap-2">
            {analysis.perRowFindings.map((f) => (
              <li
                key={f.rowKey}
                className="hairline flex flex-col gap-1 bg-surface-elevated px-3 py-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-foreground">
                    {rowLabel(f.rowKey)}
                  </span>
                  <span className={`label ${STATUS_TONE[f.status]}`}>
                    {STATUS_LABEL[f.status]}
                  </span>
                </div>
                <p className="text-sm text-muted">{f.note}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {analysis.rebalanceSuggestions.length > 0 ? (
        <div>
          <p className="label">Rebalance suggestions</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm text-foreground">
            {analysis.rebalanceSuggestions.map((s, i) => (
              <li key={`${i}-${s.slice(0, 32)}`} className="flex gap-2">
                <span className="text-subtle">·</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {analysis.dataLimitations?.length ? (
        <div>
          <p className="label">Data limitations</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm text-muted">
            {analysis.dataLimitations.map((s, i) => (
              <li key={`${i}-${s.slice(0, 32)}`} className="flex gap-2">
                <span className="text-subtle">-</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function riskLabel(risk: NonNullable<Analysis["riskLevel"]>) {
  return risk === "very-high" ? "Very high risk" : `${risk} risk`;
}

function riskTone(risk: NonNullable<Analysis["riskLevel"]>) {
  if (risk === "low") return "text-gain";
  if (risk === "moderate") return "text-warning";
  if (risk === "high") return "text-loss";
  return "text-loss";
}

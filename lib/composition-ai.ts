import OpenAI from "openai";

export type CompositionFinding = {
  rowKey: string;
  status: "on-target" | "underweight" | "overweight" | "concern";
  note: string;
};

export type CompositionAnalysis = {
  summary: string;
  perRowFindings: CompositionFinding[];
  rebalanceSuggestions: string[];
  suitabilityAssessment?: string;
  riskLevel?: "low" | "moderate" | "high" | "very-high";
  keyRiskDrivers?: string[];
  diversificationFeedback?: string;
  dataLimitations?: string[];
  generatedAt: string;
};

type InvestmentProfile = {
  objective: string | null;
  riskTolerance: string | null;
  timeHorizon: string | null;
  liquidityNeed: string | null;
  notes: string | null;
};

type PortfolioCompositionInput = {
  scope: "portfolio";
  name: string;
  baseCurrency: string;
  totalValueBase: number;
  investmentProfile: InvestmentProfile;
  metrics: {
    topPositionPercent: number;
    top3PositionPercent: number;
    holdingCount: number;
    sectorExposures: { label: string; percent: number }[];
    currencyExposures: { label: string; percent: number }[];
  };
  rows: {
    rowKey: string;
    symbol: string;
    name: string;
    sector: string | null;
    targetPercent: number;
    targetMinPercent: number;
    targetMaxPercent: number;
    actualPercent: number;
    driftPercent: number;
    rangeStatus: "on-target" | "underweight" | "overweight";
    rebalanceTargetPercent: number;
    marketValueBase: number;
    isHeld: boolean;
  }[];
  model: string;
  reasoningEffort: "minimal" | "low" | "medium" | "high";
};

type GroupCompositionInput = {
  scope: "group";
  name: string;
  baseCurrency: string;
  totalValueBase: number;
  investmentProfile: InvestmentProfile;
  metrics: {
    topPortfolioPercent: number;
    portfolioCount: number;
    cashPercent: number;
    cashInvestmentPercent: number;
  };
  rows: {
    rowKey: string;
    label: string;
    targetPercent: number;
    targetMinPercent: number;
    targetMaxPercent: number;
    actualPercent: number;
    driftPercent: number;
    rangeStatus: "on-target" | "underweight" | "overweight";
    rebalanceTargetPercent: number;
    valueBase: number;
    kind: "portfolio" | "cash" | "cash-investment";
  }[];
  model: string;
  reasoningEffort: "minimal" | "low" | "medium" | "high";
};

export type CompositionInput =
  | PortfolioCompositionInput
  | GroupCompositionInput;

const SYSTEM_PROMPT = `You are a portfolio-allocation analyst. Given a portfolio or a group of portfolios plus cash with target ranges, actual weights, and an investment profile, produce an honest assessment.

Rules for the response:
- summary: 2-4 plain-English sentences on overall composition health and the most important issues.
- perRowFindings: one entry per row provided in the input. Use rowKey verbatim from the input. Prefer the provided rangeStatus for allocation status. Use concern only for a quality/risk issue independent of range drift.
- rebalanceSuggestions: a short list of 0-5 concrete actions. Aim only for the nearest target range bound, not a full midpoint rebalance. Plain text, one per array element, no markdown.
- suitabilityAssessment: 2-4 sentences judging whether the composition suits the stated objective, risk tolerance, horizon, liquidity need, and notes. If profile data is thin, say so and assess generally.
- riskLevel: one of low, moderate, high, very-high.
- keyRiskDrivers: 0-6 concise drivers such as concentration, cash drag, currency exposure, sector crowding, single-stock risk, or mismatch with profile.
- diversificationFeedback: 1-3 sentences on composition quality, concentration, sector/currency spread, and whether risk looks intentional or accidental.
- dataLimitations: 0-5 concise limitations from the data given. Mention missing profile fields, missing prices, missing sector data, or lack of holdings-level look-through where relevant.
- Be specific to the data given. Do not invent rows. Do not output rows that were not in the input.
- No markdown, no JSON inside any string field.`;

function buildUserMessage(input: CompositionInput): string {
  if (input.scope === "portfolio") {
    return `Analyse this portfolio's composition, suitability, and rebalance needs.\n${JSON.stringify(
      {
        scope: input.scope,
        portfolio: input.name,
        baseCurrency: input.baseCurrency,
        totalValueBase: input.totalValueBase,
        investmentProfile: input.investmentProfile,
        metrics: input.metrics,
        rows: input.rows,
      },
      null,
      2,
    )}`;
  }
  return `Analyse this portfolio group's composition, suitability, and rebalance needs.\n${JSON.stringify(
    {
      scope: input.scope,
      group: input.name,
      baseCurrency: input.baseCurrency,
      totalValueBase: input.totalValueBase,
      investmentProfile: input.investmentProfile,
      metrics: input.metrics,
      rows: input.rows,
    },
    null,
    2,
  )}`;
}

export async function analyzeComposition(
  input: CompositionInput,
): Promise<CompositionAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.create({
    model: input.model,
    reasoning_effort: input.reasoningEffort,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserMessage(input) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "composition_analysis",
        strict: true,
        schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            perRowFindings: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  rowKey: { type: "string" },
                  status: {
                    type: "string",
                    enum: ["on-target", "underweight", "overweight", "concern"],
                  },
                  note: { type: "string" },
                },
                required: ["rowKey", "status", "note"],
                additionalProperties: false,
              },
            },
            rebalanceSuggestions: {
              type: "array",
              items: { type: "string" },
            },
            suitabilityAssessment: { type: "string" },
            riskLevel: {
              type: "string",
              enum: ["low", "moderate", "high", "very-high"],
            },
            keyRiskDrivers: {
              type: "array",
              items: { type: "string" },
            },
            diversificationFeedback: { type: "string" },
            dataLimitations: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: [
            "summary",
            "perRowFindings",
            "rebalanceSuggestions",
            "suitabilityAssessment",
            "riskLevel",
            "keyRiskDrivers",
            "diversificationFeedback",
            "dataLimitations",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  const text = response.choices[0]?.message?.content;
  if (!text) throw new Error("AI returned an empty response");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`AI returned invalid JSON: ${text.slice(0, 200)}`);
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).summary !== "string" ||
    !Array.isArray((parsed as Record<string, unknown>).perRowFindings) ||
    !Array.isArray((parsed as Record<string, unknown>).rebalanceSuggestions)
  ) {
    throw new Error("AI response missing required fields");
  }

  const out = parsed as CompositionAnalysis;
  return { ...out, generatedAt: new Date().toISOString() };
}

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
  generatedAt: string;
};

type PortfolioCompositionInput = {
  scope: "portfolio";
  name: string;
  baseCurrency: string;
  totalValueBase: number;
  rows: {
    rowKey: string;
    symbol: string;
    name: string;
    sector: string | null;
    targetPercent: number;
    actualPercent: number;
    driftPercent: number;
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
  rows: {
    rowKey: string;
    label: string;
    targetPercent: number;
    actualPercent: number;
    driftPercent: number;
    valueBase: number;
    kind: "portfolio" | "cash";
  }[];
  model: string;
  reasoningEffort: "minimal" | "low" | "medium" | "high";
};

export type CompositionInput =
  | PortfolioCompositionInput
  | GroupCompositionInput;

const SYSTEM_PROMPT = `You are a portfolio-allocation analyst. Given a portfolio (or a group of portfolios + cash) with target and actual weights, produce an honest assessment.

Rules for the response:
- summary: 2–4 plain-English sentences on overall composition health and the most important issues.
- perRowFindings: one entry per row provided in the input. Use rowKey verbatim from the input. status must be one of: 'on-target' (drift within ±1%), 'underweight' (actual materially below target), 'overweight' (actual materially above target), 'concern' (a quality/risk issue independent of drift).
- rebalanceSuggestions: a short list (0–5) of concrete actions, e.g. "Trim XYZ by ~2% to fund underweight ABC". Plain text, one per array element, no markdown.
- Be specific to the data given. Do not invent rows. Do not output rows that were not in the input.
- No markdown, no JSON inside any string field.`;

function buildUserMessage(input: CompositionInput): string {
  if (input.scope === "portfolio") {
    return `Analyse this portfolio's composition and suggest rebalances.\n${JSON.stringify(
      {
        scope: input.scope,
        portfolio: input.name,
        baseCurrency: input.baseCurrency,
        totalValueBase: input.totalValueBase,
        rows: input.rows,
      },
      null,
      2,
    )}`;
  }
  return `Analyse this portfolio group's composition (portfolios + cash) and suggest rebalances.\n${JSON.stringify(
    {
      scope: input.scope,
      group: input.name,
      baseCurrency: input.baseCurrency,
      totalValueBase: input.totalValueBase,
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
          },
          required: ["summary", "perRowFindings", "rebalanceSuggestions"],
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

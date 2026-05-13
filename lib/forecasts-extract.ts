import OpenAI from "openai";

export type ExtractedForecast = {
  targetPrice: number | null;
  lowCase: number | null;
  highCase: number | null;
  expectedReturn: number | null;
  horizonMonths: number;
  rationale: string;
  confidence: number;
  extractedNotes: string;
};

type ExtractInput = {
  text: string;
  symbol: string;
  name: string;
  currency: string;
  currentPrice: number | null;
  model: string;
  reasoningEffort: "minimal" | "low" | "medium" | "high";
};

const SYSTEM_PROMPT = `You are extracting a price-target thesis written by a portfolio owner about a stock they hold or watch.

Rules:
- Be faithful to the author's view. Do not editorialise, override, or contradict.
- Only return numbers that the author stated (or that follow directly from stated numbers, e.g. "+20% from $100" → 120). Return null otherwise.
- targetPrice: the author's central-case 12-month (or stated horizon) price target. Positive number, or null.
- lowCase: the author's bear-case price. Strictly less than targetPrice. Null if not stated.
- highCase: the author's bull-case price. Strictly greater than targetPrice. Null if not stated.
- expectedReturn: percentage return implied by the author's target vs current price. Null if not stated and currentPrice unknown.
- horizonMonths: integer months for the central case. Default 12 if not stated.
- rationale: the author's own reasoning, summarised in 3–5 plain-English sentences. Stay close to their words; do not add new arguments.
- confidence: 0–1 — how confident you are that the numbers were stated explicitly (1 = directly quoted, 0 = guessed from context).
- extractedNotes: anything else worth surfacing (catalysts, risks, conviction) in 1–3 sentences.`;

function buildUserMessage(input: ExtractInput): string {
  return `Stock context:
- symbol: ${input.symbol}
- name: ${input.name}
- currency: ${input.currency}
- currentPrice: ${input.currentPrice ?? "unknown"}

Author's analysis (verbatim, may be PDF-extracted with imperfect formatting):
---
${input.text}
---`;
}

export async function extractForecastFromText(
  input: ExtractInput,
): Promise<ExtractedForecast> {
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
        name: "extracted_forecast",
        strict: true,
        schema: {
          type: "object",
          properties: {
            targetPrice: { type: ["number", "null"] },
            lowCase: { type: ["number", "null"] },
            highCase: { type: ["number", "null"] },
            expectedReturn: { type: ["number", "null"] },
            horizonMonths: { type: "integer" },
            rationale: { type: "string" },
            confidence: { type: "number" },
            extractedNotes: { type: "string" },
          },
          required: [
            "targetPrice",
            "lowCase",
            "highCase",
            "expectedReturn",
            "horizonMonths",
            "rationale",
            "confidence",
            "extractedNotes",
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

  const obj = parsed as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  const result: ExtractedForecast = {
    targetPrice: num(obj.targetPrice),
    lowCase: num(obj.lowCase),
    highCase: num(obj.highCase),
    expectedReturn: num(obj.expectedReturn),
    horizonMonths:
      typeof obj.horizonMonths === "number" ? obj.horizonMonths : 12,
    rationale: typeof obj.rationale === "string" ? obj.rationale : "",
    confidence: typeof obj.confidence === "number" ? obj.confidence : 0,
    extractedNotes:
      typeof obj.extractedNotes === "string" ? obj.extractedNotes : "",
  };

  if (result.targetPrice != null && result.targetPrice <= 0) {
    result.targetPrice = null;
  }
  if (
    result.lowCase != null &&
    result.targetPrice != null &&
    result.lowCase >= result.targetPrice
  ) {
    result.lowCase = null;
  }
  if (
    result.highCase != null &&
    result.targetPrice != null &&
    result.highCase <= result.targetPrice
  ) {
    result.highCase = null;
  }

  return result;
}

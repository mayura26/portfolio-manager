import OpenAI from "openai";
import { db } from "./db";
import type { DailyBar, FinancialSummary } from "./yahoo";

export type ForecastResult = {
  targetPrice: number;
  lowCase: number;
  highCase: number;
  expectedReturn: number;
  horizonMonths: number;
  rationale: string;
  generatedAt: string;
};

type ForecastInput = {
  symbol: string;
  name: string;
  currency: string;
  currentPrice: number;
  financials: FinancialSummary;
  recentBars: DailyBar[];
  model: string;
  reasoningEffort: "minimal" | "low" | "medium" | "high";
  horizonMonths?: number;
};

const SYSTEM_PROMPT = `You are an equity-research analyst producing a 12-month price forecast.

Rules:
- targetPrice: your central-case price target at the end of the horizon (positive number).
- lowCase: bear-case price (positive, strictly less than targetPrice).
- highCase: bull-case price (positive, strictly greater than targetPrice).
- expectedReturn: percentage return implied by targetPrice vs currentPrice (positive or negative number).
- horizonMonths: integer months for which the targetPrice applies. Echo back whatever was requested.
- rationale: 3–5 plain-English sentences. Cover the central case, the key bull/bear drivers, and what would falsify your view. No markdown, no JSON inside it.
- Ground the forecast in the supplied fundamentals and recent price action. Be deliberate about valuation, growth, and macro sensitivity.
- Street consensus (if provided) is one input among many — explicitly agree, diverge, or argue why; do not anchor blindly.`;

function buildUserMessage(input: ForecastInput): string {
  const { symbol, name, currency, currentPrice, financials, recentBars } =
    input;
  const horizon = input.horizonMonths ?? 12;
  const last20 = recentBars
    .slice(-20)
    .map((b) => b.close.toFixed(2))
    .join(", ");

  const data = {
    symbol,
    name,
    currency,
    currentPrice,
    horizonMonths: horizon,
    weekHigh52: financials.weekHigh52,
    weekLow52: financials.weekLow52,
    peRatio: financials.peRatio,
    forwardPE: financials.forwardPE,
    eps: financials.eps,
    dividendYield: financials.dividendYield,
    beta: financials.beta,
    profitMargin: financials.profitMargin,
    returnOnEquity: financials.returnOnEquity,
    priceToBook: financials.priceToBook,
    streetConsensus: {
      targetMean: financials.targetMeanPrice,
      targetHigh: financials.targetHighPrice,
      targetLow: financials.targetLowPrice,
      recommendationMean: financials.recommendationMean,
      recommendationKey: financials.recommendationKey,
      numberOfAnalysts: financials.numberOfAnalystOpinions,
    },
    last20DailyCloses: `[${last20}]`,
  };

  return `Produce a ${horizon}-month forecast for this stock:\n${JSON.stringify(data, null, 2)}`;
}

export async function analyzeStockForecast(
  input: ForecastInput,
): Promise<ForecastResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const horizon = input.horizonMonths ?? 12;
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
        name: "stock_forecast",
        strict: true,
        schema: {
          type: "object",
          properties: {
            targetPrice: { type: "number" },
            lowCase: { type: "number" },
            highCase: { type: "number" },
            expectedReturn: { type: "number" },
            horizonMonths: { type: "integer" },
            rationale: { type: "string" },
          },
          required: [
            "targetPrice",
            "lowCase",
            "highCase",
            "expectedReturn",
            "horizonMonths",
            "rationale",
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
    typeof (parsed as Record<string, unknown>).targetPrice !== "number" ||
    typeof (parsed as Record<string, unknown>).lowCase !== "number" ||
    typeof (parsed as Record<string, unknown>).highCase !== "number" ||
    typeof (parsed as Record<string, unknown>).expectedReturn !== "number" ||
    typeof (parsed as Record<string, unknown>).horizonMonths !== "number" ||
    typeof (parsed as Record<string, unknown>).rationale !== "string"
  ) {
    throw new Error("AI response missing required fields");
  }

  const result = parsed as {
    targetPrice: number;
    lowCase: number;
    highCase: number;
    expectedReturn: number;
    horizonMonths: number;
    rationale: string;
  };

  if (result.targetPrice <= 0 || result.lowCase <= 0 || result.highCase <= 0) {
    throw new Error("AI returned non-positive prices");
  }
  if (
    result.lowCase >= result.targetPrice ||
    result.highCase <= result.targetPrice
  ) {
    throw new Error(
      `AI returned invalid scenario ordering: low=${result.lowCase}, target=${result.targetPrice}, high=${result.highCase}`,
    );
  }

  return {
    targetPrice: result.targetPrice,
    lowCase: result.lowCase,
    highCase: result.highCase,
    expectedReturn: result.expectedReturn,
    horizonMonths: result.horizonMonths || horizon,
    rationale: result.rationale,
    generatedAt: new Date().toISOString(),
  };
}

// Picks the forecast that should be shown to the user and used by signals.
// Priority: explicitly pinned > latest USER-source > latest AI-source.
export async function resolveActiveForecast(instrumentId: string) {
  const pinned = await db.instrumentForecast.findFirst({
    where: { instrumentId, isPinned: true },
    orderBy: { generatedAt: "desc" },
  });
  if (pinned) return pinned;

  const user = await db.instrumentForecast.findFirst({
    where: { instrumentId, source: "USER" },
    orderBy: { generatedAt: "desc" },
  });
  if (user) return user;

  return db.instrumentForecast.findFirst({
    where: { instrumentId, source: "AI" },
    orderBy: { generatedAt: "desc" },
  });
}

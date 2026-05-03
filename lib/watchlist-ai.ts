import OpenAI from "openai";
import type { DailyBar, FinancialSummary } from "./yahoo";

export type WatchlistAiAnalysis = {
  suggestedLow: number;
  suggestedHigh: number;
  rationale: string;
  generatedAt: string;
};

type AnalysisInput = {
  symbol: string;
  name: string;
  currency: string;
  currentPrice: number;
  financials: FinancialSummary;
  recentBars: DailyBar[];
  model: string;
  reasoningEffort: "minimal" | "low" | "medium" | "high";
};

const SYSTEM_PROMPT = `You are a value-investing analyst. Given fundamental and recent price data for a stock, suggest a buy zone (price range) representing an attractive entry point.

Rules for the response:
- suggestedLow must be a positive number strictly less than suggestedHigh
- suggestedHigh should normally be at or below the current price; only exceed current price if the stock looks clearly undervalued
- Base the range on: 52-week low/high positioning, P/E vs historical norms, margin of safety, support from recent price action
- Rationale must be 2–4 plain-English sentences explaining the buy zone — no markdown, no JSON inside it`;

function buildUserMessage(input: AnalysisInput): string {
  const { symbol, name, currency, currentPrice, financials, recentBars } =
    input;
  const last20 = recentBars
    .slice(-20)
    .map((b) => b.close.toFixed(2))
    .join(", ");

  const data = {
    symbol,
    name,
    currency,
    currentPrice,
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
    last20DailyCloses: `[${last20}]`,
  };

  return `Analyse this stock and produce a buy-zone recommendation:\n${JSON.stringify(data, null, 2)}`;
}

export async function analyzeWatchlistBuyZone(
  input: AnalysisInput,
): Promise<WatchlistAiAnalysis> {
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
        name: "buy_zone_analysis",
        strict: true,
        schema: {
          type: "object",
          properties: {
            suggestedLow: { type: "number" },
            suggestedHigh: { type: "number" },
            rationale: { type: "string" },
          },
          required: ["suggestedLow", "suggestedHigh", "rationale"],
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
    typeof (parsed as Record<string, unknown>).suggestedLow !== "number" ||
    typeof (parsed as Record<string, unknown>).suggestedHigh !== "number" ||
    typeof (parsed as Record<string, unknown>).rationale !== "string"
  ) {
    throw new Error("AI response missing required fields");
  }

  const result = parsed as {
    suggestedLow: number;
    suggestedHigh: number;
    rationale: string;
  };

  if (result.suggestedLow <= 0 || result.suggestedHigh <= result.suggestedLow) {
    throw new Error(
      `AI returned invalid range: ${result.suggestedLow}–${result.suggestedHigh}`,
    );
  }

  return {
    suggestedLow: result.suggestedLow,
    suggestedHigh: result.suggestedHigh,
    rationale: result.rationale,
    generatedAt: new Date().toISOString(),
  };
}

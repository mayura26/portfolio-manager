import OpenAI from "openai";

export type AutoWatcherDailySummary = {
  headline: string;
  summary: string;
  sentiment: "bullish" | "bearish" | "neutral";
  generatedAt: string;
};

type AutoWatcherSummaryInput = {
  symbol: string;
  name: string;
  currency: string;
  currentPrice: number;
  dayChangePct: number;
  weekChangePct: number | null;
  avgCostBase: number;
  unrealizedPnLPct: number | null;
  newsHeadlines: string[];
};

const SYSTEM_PROMPT = `You are a brief daily investment monitor for a personal portfolio. Given price movement data and recent news for a held stock, produce a concise daily update.

Rules:
- headline: one sentence (max 80 chars) summarising the most important thing that happened
- summary: 2–3 plain-English sentences covering the day's move and any relevant news context
- sentiment: "bullish", "bearish", or "neutral" based on the day's overall picture
- No markdown, no JSON inside strings, no generic filler phrases`;

function buildUserMessage(input: AutoWatcherSummaryInput): string {
  const data = {
    symbol: input.symbol,
    name: input.name,
    currency: input.currency,
    currentPrice: input.currentPrice,
    dayChangePct: `${input.dayChangePct >= 0 ? "+" : ""}${input.dayChangePct.toFixed(2)}%`,
    weekChangePct:
      input.weekChangePct != null
        ? `${input.weekChangePct >= 0 ? "+" : ""}${input.weekChangePct.toFixed(2)}%`
        : "n/a",
    avgCostBase: input.avgCostBase,
    unrealizedPnL:
      input.unrealizedPnLPct != null
        ? `${input.unrealizedPnLPct >= 0 ? "+" : ""}${input.unrealizedPnLPct.toFixed(1)}%`
        : "n/a",
    recentNewsHeadlines:
      input.newsHeadlines.length > 0
        ? input.newsHeadlines
        : ["(no recent news)"],
  };

  return `Generate a daily monitor update for this holding:\n${JSON.stringify(data, null, 2)}`;
}

export async function generateDailySummary(
  input: AutoWatcherSummaryInput,
): Promise<AutoWatcherDailySummary> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserMessage(input) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "daily_summary",
        strict: true,
        schema: {
          type: "object",
          properties: {
            headline: { type: "string" },
            summary: { type: "string" },
            sentiment: {
              type: "string",
              enum: ["bullish", "bearish", "neutral"],
            },
          },
          required: ["headline", "summary", "sentiment"],
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
    typeof (parsed as Record<string, unknown>).headline !== "string" ||
    typeof (parsed as Record<string, unknown>).summary !== "string" ||
    typeof (parsed as Record<string, unknown>).sentiment !== "string"
  ) {
    throw new Error("AI response missing required fields");
  }

  const result = parsed as {
    headline: string;
    summary: string;
    sentiment: string;
  };

  const validSentiments = ["bullish", "bearish", "neutral"] as const;
  const sentiment = validSentiments.includes(
    result.sentiment as (typeof validSentiments)[number],
  )
    ? (result.sentiment as "bullish" | "bearish" | "neutral")
    : "neutral";

  return {
    headline: result.headline.slice(0, 120),
    summary: result.summary,
    sentiment,
    generatedAt: new Date().toISOString(),
  };
}

import OpenAI from "openai";

export type AutoWatcherDailySummary = {
  headline: string;
  summary: string;
  sentiment: "bullish" | "bearish" | "neutral";
  urgency: "immediate" | "defer";
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
- urgency: "immediate" if the event warrants an alert right now; "defer" if it can wait for the weekly report
  - Use "immediate" for: day move ≥ 5% in either direction; earnings/results/guidance; dividends declared or cut; analyst upgrades/downgrades; acquisitions, mergers, or takeover bids; CEO/CFO changes; regulatory actions, investigations, or legal proceedings; any company-specific event with clear direct price impact
  - Use "defer" for: routine daily moves under 5%, broad market commentary, minor news with no clear immediate impact on the stock
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
            urgency: {
              type: "string",
              enum: ["immediate", "defer"],
            },
          },
          required: ["headline", "summary", "sentiment", "urgency"],
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
    typeof (parsed as Record<string, unknown>).sentiment !== "string" ||
    typeof (parsed as Record<string, unknown>).urgency !== "string"
  ) {
    throw new Error("AI response missing required fields");
  }

  const result = parsed as {
    headline: string;
    summary: string;
    sentiment: string;
    urgency: string;
  };

  const validSentiments = ["bullish", "bearish", "neutral"] as const;
  const sentiment = validSentiments.includes(
    result.sentiment as (typeof validSentiments)[number],
  )
    ? (result.sentiment as "bullish" | "bearish" | "neutral")
    : "neutral";

  const urgency = result.urgency === "defer" ? "defer" : "immediate";

  return {
    headline: result.headline.slice(0, 120),
    summary: result.summary,
    sentiment,
    urgency,
    generatedAt: new Date().toISOString(),
  };
}

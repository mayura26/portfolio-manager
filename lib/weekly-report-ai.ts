import OpenAI from "openai";
import type { WeeklyData } from "@/lib/weekly-report";

export type WeeklyGroupReportContent = {
  groupName: string;
  headline: string;
  performance: string;
  notableMovers: { symbol: string; note: string }[];
  activity: string;
  watchpoints: string[];
};

export type WeeklyReportContent = {
  headline: string;
  overview: string;
  performance: string;
  notableMovers: { symbol: string; note: string }[];
  groups?: WeeklyGroupReportContent[];
  activity: string;
  watchpoints: string[];
  generatedAt: string;
};

const SYSTEM_PROMPT = `You are the in-house analyst writing a private weekly portfolio review for a single investor. The week runs Sunday to Saturday.

Write a clear, grounded report from the structured data provided. Rules:
- Be specific and factual — cite the actual numbers, symbols and moves in the data. Never invent figures or events not present in the data.
- "headline" is one sentence (max 90 characters) capturing the week's character.
- "overview" is 2-4 sentences framing how the week went overall.
- "performance" is 2-4 sentences on total portfolio value and the spread of moves; if portfolio value data is missing, say so plainly.
- "notableMovers" covers the most significant 3-6 names from the movers data, each with a one-sentence note. If there are no movers, return an empty array.
- "groups" contains one object per portfolio group in the input, in the same order. Analyse each group against its own profile, objective, risk tolerance, time horizon, liquidity need and notes. Do not use the same language for groups with different goals.
- For each group: "headline" is one sentence, "performance" is 2-4 sentences, "activity" is 1-3 sentences, "notableMovers" covers up to 4 names from that group's movers, and "watchpoints" is 1-4 concrete items.
- "activity" is 2-3 sentences summarising trades, cash flows, triggered alerts and completed reviews. If the week was quiet, say so.
- "watchpoints" is 2-5 short, concrete items to keep an eye on next week, drawn from the data (open forecasts, alerts, large positions). Plain strings, no markdown.
- Plain English throughout. No markdown formatting inside any field.`;

function buildUserMessage(data: WeeklyData): string {
  return `Write the weekly review from this data (amounts are in ${data.baseCurrency}):\n${JSON.stringify(data, null, 2)}`;
}

export async function generateWeeklyReportContent(
  data: WeeklyData,
  model: string,
  reasoningEffort: "minimal" | "low" | "medium" | "high",
): Promise<WeeklyReportContent> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.create({
    model,
    reasoning_effort: reasoningEffort,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserMessage(data) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "weekly_report",
        strict: true,
        schema: {
          type: "object",
          properties: {
            headline: { type: "string" },
            overview: { type: "string" },
            performance: { type: "string" },
            notableMovers: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  symbol: { type: "string" },
                  note: { type: "string" },
                },
                required: ["symbol", "note"],
                additionalProperties: false,
              },
            },
            groups: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  groupName: { type: "string" },
                  headline: { type: "string" },
                  performance: { type: "string" },
                  notableMovers: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        symbol: { type: "string" },
                        note: { type: "string" },
                      },
                      required: ["symbol", "note"],
                      additionalProperties: false,
                    },
                  },
                  activity: { type: "string" },
                  watchpoints: { type: "array", items: { type: "string" } },
                },
                required: [
                  "groupName",
                  "headline",
                  "performance",
                  "notableMovers",
                  "activity",
                  "watchpoints",
                ],
                additionalProperties: false,
              },
            },
            activity: { type: "string" },
            watchpoints: { type: "array", items: { type: "string" } },
          },
          required: [
            "headline",
            "overview",
            "performance",
            "notableMovers",
            "groups",
            "activity",
            "watchpoints",
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
  if (
    typeof obj.headline !== "string" ||
    typeof obj.overview !== "string" ||
    typeof obj.performance !== "string" ||
    typeof obj.activity !== "string" ||
    !Array.isArray(obj.notableMovers) ||
    !Array.isArray(obj.groups) ||
    !Array.isArray(obj.watchpoints)
  ) {
    throw new Error("AI response missing required fields");
  }

  return {
    headline: obj.headline,
    overview: obj.overview,
    performance: obj.performance,
    notableMovers: (
      obj.notableMovers as { symbol: string; note: string }[]
    ).map((m) => ({ symbol: String(m.symbol), note: String(m.note) })),
    groups: (obj.groups as WeeklyGroupReportContent[]).map((group) => ({
      groupName: String(group.groupName),
      headline: String(group.headline),
      performance: String(group.performance),
      notableMovers: Array.isArray(group.notableMovers)
        ? group.notableMovers.map((m) => ({
            symbol: String(m.symbol),
            note: String(m.note),
          }))
        : [],
      activity: String(group.activity),
      watchpoints: Array.isArray(group.watchpoints)
        ? group.watchpoints.map((w) => String(w))
        : [],
    })),
    activity: obj.activity,
    watchpoints: (obj.watchpoints as unknown[]).map((w) => String(w)),
    generatedAt: new Date().toISOString(),
  };
}

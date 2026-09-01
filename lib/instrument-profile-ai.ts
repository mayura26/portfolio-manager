import OpenAI from "openai";
import {
  INSTRUMENT_TYPE_OPTIONS,
  isInstrumentTypeOption,
} from "@/lib/instrument-types";

export type InstrumentProfileDraftInput = {
  symbol: string;
  yahooSymbol: string;
  name: string;
  exchange: string;
  currency: string;
  currentSector: string | null;
  currentIndustry: string | null;
  currentInstrumentType: string;
};

export type InstrumentProfileDraft = {
  sector: string;
  industry: string;
  instrumentType: string;
  rationale: string;
};

const SYSTEM_PROMPT = `You classify portfolio instruments for exposure reporting.

Return concise profile fields:
- sector: a practical exposure bucket. Use a standard equity sector for operating companies, but for funds/products use useful portfolio buckets such as Fixed Income, Gold / Commodities, Broad Market Equity, Country / Regional Equity, Cash / Currency, Crypto, or Other.
- industry: a more specific description of the business or fund/product exposure.
- instrumentType: one of the allowed enum values. Use INCOME_EQUITY for ordinary listed companies whose main portfolio role is dividend/income generation, INCOME_ETF for income-oriented equity funds, BOND/BOND_ETF for fixed-income exposure, and COMMODITY for gold, commodity, or precious-metal products.
- rationale: one plain-English sentence explaining the classification.

Prefer useful portfolio exposure over overly literal exchange metadata. Do not use markdown.`;

function buildUserMessage(input: InstrumentProfileDraftInput): string {
  return JSON.stringify(
    {
      symbol: input.symbol,
      yahooSymbol: input.yahooSymbol,
      name: input.name,
      exchange: input.exchange,
      currency: input.currency,
      currentProfile: {
        sector: input.currentSector,
        industry: input.currentIndustry,
        instrumentType: input.currentInstrumentType,
      },
      allowedInstrumentTypes: INSTRUMENT_TYPE_OPTIONS,
    },
    null,
    2,
  );
}

function clean(value: string, max: number): string {
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

export async function generateInstrumentProfileDraft(
  input: InstrumentProfileDraftInput,
): Promise<InstrumentProfileDraft> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.create({
    model: process.env.INSTRUMENT_PROFILE_AI_MODEL ?? "gpt-5.4-mini",
    reasoning_effort: "low",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserMessage(input) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "instrument_profile_draft",
        strict: true,
        schema: {
          type: "object",
          properties: {
            sector: { type: "string" },
            industry: { type: "string" },
            instrumentType: {
              type: "string",
              enum: [...INSTRUMENT_TYPE_OPTIONS],
            },
            rationale: { type: "string" },
          },
          required: ["sector", "industry", "instrumentType", "rationale"],
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
    typeof (parsed as Record<string, unknown>).sector !== "string" ||
    typeof (parsed as Record<string, unknown>).industry !== "string" ||
    typeof (parsed as Record<string, unknown>).instrumentType !== "string" ||
    typeof (parsed as Record<string, unknown>).rationale !== "string"
  ) {
    throw new Error("AI response missing required fields");
  }

  const draft = parsed as Record<string, string>;
  if (!isInstrumentTypeOption(draft.instrumentType)) {
    throw new Error(
      `AI returned invalid instrument type: ${draft.instrumentType}`,
    );
  }

  return {
    sector: clean(draft.sector, 100),
    industry: clean(draft.industry, 150),
    instrumentType: draft.instrumentType,
    rationale: clean(draft.rationale, 300),
  };
}

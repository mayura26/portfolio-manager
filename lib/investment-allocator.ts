import OpenAI from "openai";

export type InvestmentAllocationItem = {
  symbol: string;
  name: string;
  portfolioName: string;
  suggestedAmount: number;
  rationale: string;
  priority: "primary" | "secondary";
};

export type InvestmentAllocation = {
  strategy: string;
  allocations: InvestmentAllocationItem[];
  totalAllocated: number;
  cashRetained: number;
  cashRetainedReason: string | null;
  generatedAt: string;
};

type HoldingInput = {
  portfolioName: string;
  symbol: string;
  name: string;
  sector: string | null;
  actualPercent: number;
  targetPercent: number;
  driftPercent: number;
  rangeStatus: "on-target" | "underweight" | "overweight";
  recommendationAction: "BUY" | "SELL" | "TRIM" | null;
  intendedBuyPrice: number | null;
  unrealizedPnLPercent: number | null;
  forecast: {
    targetPrice: number;
    expectedReturn: number | null;
    lowCase: number | null;
    highCase: number | null;
  } | null;
};

export type InvestmentAllocatorInput = {
  groupName: string;
  baseCurrency: string;
  totalGroupValue: number;
  cashToInvest: number;
  minTradeAmount: number;
  maxPositions: number;
  investmentProfile: {
    objective: string | null;
    riskTolerance: string | null;
    timeHorizon: string | null;
    liquidityNeed: string | null;
    notes: string | null;
  };
  holdings: HoldingInput[];
  model: string;
  reasoningEffort: "minimal" | "low" | "medium" | "high";
};

const SYSTEM_PROMPT = `You are a portfolio investment adviser. The user has a fixed cash amount to deploy across their existing portfolio group. Your job is to recommend the optimal allocation of that cash across one or a small number of positions.

Rules:
- Only recommend positions with a BUY recommendation, underweight status, or that represent strong value based on forecasts.
- Prefer fewer high-conviction picks over spreading thinly. It is better to put most cash in one great opportunity than to make many small trades.
- Every single allocation must be at or above the minimum trade amount provided. Never suggest an allocation below it.
- The sum of all suggested amounts must not exceed cashToInvest.
- Do not recommend positions with SELL or TRIM recommendations.
- If no positions clearly merit new investment, retain all cash and explain why.
- Respect the investment profile: risk tolerance, time horizon, objective.
- The strategy field should explain your overall approach in 2-3 plain sentences.
- Each rationale should be 1-2 plain sentences specific to why this position and this amount.
- No markdown, no JSON inside string fields.`;

function buildUserMessage(input: InvestmentAllocatorInput): string {
  return `Allocate ${input.cashToInvest} ${input.baseCurrency} of new cash into the "${input.groupName}" portfolio group.\n${JSON.stringify(
    {
      totalGroupValue: input.totalGroupValue,
      cashToInvest: input.cashToInvest,
      baseCurrency: input.baseCurrency,
      minTradeAmount: input.minTradeAmount,
      maxPositions: input.maxPositions,
      investmentProfile: input.investmentProfile,
      holdings: input.holdings,
    },
    null,
    2,
  )}`;
}

export async function analyzeInvestmentAllocation(
  input: InvestmentAllocatorInput,
): Promise<InvestmentAllocation> {
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
        name: "investment_allocation",
        strict: true,
        schema: {
          type: "object",
          properties: {
            strategy: { type: "string" },
            allocations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  symbol: { type: "string" },
                  name: { type: "string" },
                  portfolioName: { type: "string" },
                  suggestedAmount: { type: "number" },
                  rationale: { type: "string" },
                  priority: {
                    type: "string",
                    enum: ["primary", "secondary"],
                  },
                },
                required: [
                  "symbol",
                  "name",
                  "portfolioName",
                  "suggestedAmount",
                  "rationale",
                  "priority",
                ],
                additionalProperties: false,
              },
            },
            totalAllocated: { type: "number" },
            cashRetained: { type: "number" },
            cashRetainedReason: { type: ["string", "null"] },
          },
          required: [
            "strategy",
            "allocations",
            "totalAllocated",
            "cashRetained",
            "cashRetainedReason",
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
    typeof (parsed as Record<string, unknown>).strategy !== "string" ||
    !Array.isArray((parsed as Record<string, unknown>).allocations)
  ) {
    throw new Error("AI response missing required fields");
  }

  const out = parsed as Omit<InvestmentAllocation, "generatedAt">;
  return { ...out, generatedAt: new Date().toISOString() };
}

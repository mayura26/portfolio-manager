import OpenAI from "openai";

export type PortfolioRecommendationAction = "BUY" | "SELL" | "TRIM";
export type PortfolioRecommendationSource = "MANUAL" | "AI";

export type RecommendationRuleInput = {
  isHeld: boolean;
  currentPrice: number | null;
  intendedBuyPrice: number | null;
  intendedSellPrice: number | null;
  trimAtGainPercent: number | null;
  globalGainThresholdPercent: number;
  unrealizedGainPercent: number | null;
  rangeStatus: "on-target" | "underweight" | "overweight";
  driftPercent: number;
  forecastTargetPrice: number | null;
  forecastHighCase: number | null;
  streetTargetMean: number | null;
  streetTargetHigh: number | null;
};

export type RecommendationRuleResult = {
  action: PortfolioRecommendationAction;
  hardLocked: boolean;
  matchedRules: string[];
};

export type RecommendationAiInput = RecommendationRuleInput & {
  symbol: string;
  name: string;
  currency: string;
  targetMinPercent: number;
  targetMaxPercent: number;
  actualPercent: number;
  marketValueBase: number;
  notes: string | null;
  ruleResult: RecommendationRuleResult;
  model: string;
  reasoningEffort: "minimal" | "low" | "medium" | "high";
};

export type RecommendationAiResult = {
  action: PortfolioRecommendationAction;
  rationale: string;
  intendedBuyPrice: number | null;
  intendedSellPrice: number | null;
  trimAtGainPercent: number | null;
  generatedAt: string;
};

const MATERIAL_OVERWEIGHT_PERCENT = 2;

export function determinePortfolioRecommendation(
  input: RecommendationRuleInput,
): RecommendationRuleResult {
  const sellRules: string[] = [];
  const trimRules: string[] = [];
  const buyRules: string[] = [];

  if (input.currentPrice != null) {
    if (
      input.forecastHighCase != null &&
      input.currentPrice >= input.forecastHighCase
    ) {
      sellRules.push("Price is at or above the active bull case");
    }
    if (
      input.streetTargetHigh != null &&
      input.currentPrice >= input.streetTargetHigh
    ) {
      sellRules.push("Price is at or above the analyst high target");
    }
    if (
      input.streetTargetMean != null &&
      input.currentPrice >= input.streetTargetMean
    ) {
      sellRules.push("Price is at or above the analyst mean target");
    }
    if (
      input.intendedSellPrice != null &&
      input.currentPrice >= input.intendedSellPrice
    ) {
      sellRules.push("Price is at or above the intended sell price");
    }
  }

  const gainThreshold =
    input.trimAtGainPercent ?? input.globalGainThresholdPercent;
  if (
    input.isHeld &&
    input.unrealizedGainPercent != null &&
    input.unrealizedGainPercent >= gainThreshold
  ) {
    trimRules.push(
      `Unrealized gain is at or above the ${gainThreshold.toFixed(0)}% trim threshold`,
    );
  }
  if (
    input.isHeld &&
    input.rangeStatus === "overweight" &&
    input.driftPercent >= MATERIAL_OVERWEIGHT_PERCENT
  ) {
    trimRules.push("Position is materially above its target range");
  }

  if (!input.isHeld) {
    buyRules.push("Target-only instrument is not currently held");
  }
  if (input.rangeStatus === "underweight") {
    buyRules.push("Position is below its target range");
  }
  if (
    input.currentPrice != null &&
    input.intendedBuyPrice != null &&
    input.currentPrice <= input.intendedBuyPrice
  ) {
    buyRules.push("Price is at or below the intended buy price");
  }
  if (
    input.currentPrice != null &&
    input.forecastTargetPrice != null &&
    input.currentPrice < input.forecastTargetPrice
  ) {
    buyRules.push("Price is below the active forecast target");
  }
  if (
    input.currentPrice != null &&
    input.streetTargetMean != null &&
    input.currentPrice < input.streetTargetMean
  ) {
    buyRules.push("Price is below the analyst mean target");
  }

  if (sellRules.length > 0) {
    return { action: "SELL", hardLocked: true, matchedRules: sellRules };
  }
  if (trimRules.length > 0) {
    return { action: "TRIM", hardLocked: true, matchedRules: trimRules };
  }
  if (buyRules.length > 0) {
    return { action: "BUY", hardLocked: false, matchedRules: buyRules };
  }

  return {
    action: input.isHeld ? "TRIM" : "BUY",
    hardLocked: false,
    matchedRules: [
      input.isHeld
        ? "No buy or sell trigger fired; defaulting to trim/maintain discipline"
        : "No holding exists; defaulting to buy/watch for an entry",
    ],
  };
}

export function fallbackRecommendationRationale(
  result: RecommendationRuleResult,
): string {
  return result.matchedRules.join(". ");
}

export async function analyzePortfolioRecommendation(
  input: RecommendationAiInput,
): Promise<RecommendationAiResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.create({
    model: input.model,
    reasoning_effort: input.reasoningEffort,
    messages: [
      {
        role: "system",
        content:
          "You are an investment-review assistant. Draft a simple trading plan for one holding. " +
          "Recommend exactly one headline action: BUY, SELL, or TRIM (respect any hardLocked SELL or TRIM action). " +
          "Then set the plan levels — set EVERY level that is part of a sensible plan and AT LEAST ONE: " +
          "intendedBuyPrice (a price to accumulate at/below, else null), " +
          "trimAtGainPercent (a gain % at which to trim into strength, else null), " +
          "intendedSellPrice (a price to exit at/above, else null). " +
          "Ground the levels in the current price, forecasts, analyst targets, and the user's notes; prefer concrete realistic numbers in the instrument's own currency rather than round guesses. " +
          "Write a concise private rationale in plain English, no markdown, explaining the levels you set.",
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            symbol: input.symbol,
            name: input.name,
            currency: input.currency,
            selectedByRules: input.ruleResult,
            position: {
              isHeld: input.isHeld,
              currentPrice: input.currentPrice,
              marketValueBase: input.marketValueBase,
              actualPercent: input.actualPercent,
              targetMinPercent: input.targetMinPercent,
              targetMaxPercent: input.targetMaxPercent,
              rangeStatus: input.rangeStatus,
              driftPercent: input.driftPercent,
              unrealizedGainPercent: input.unrealizedGainPercent,
            },
            userTargets: {
              intendedBuyPrice: input.intendedBuyPrice,
              intendedSellPrice: input.intendedSellPrice,
              trimAtGainPercent: input.trimAtGainPercent,
              notes: input.notes,
            },
            forecast: {
              targetPrice: input.forecastTargetPrice,
              highCase: input.forecastHighCase,
              streetTargetMean: input.streetTargetMean,
              streetTargetHigh: input.streetTargetHigh,
            },
          },
          null,
          2,
        ),
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "portfolio_recommendation",
        strict: true,
        schema: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["BUY", "SELL", "TRIM"] },
            rationale: { type: "string" },
            intendedBuyPrice: { type: ["number", "null"] },
            trimAtGainPercent: { type: ["number", "null"] },
            intendedSellPrice: { type: ["number", "null"] },
          },
          required: [
            "action",
            "rationale",
            "intendedBuyPrice",
            "trimAtGainPercent",
            "intendedSellPrice",
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
    !["BUY", "SELL", "TRIM"].includes(
      String((parsed as Record<string, unknown>).action),
    ) ||
    typeof (parsed as Record<string, unknown>).rationale !== "string"
  ) {
    throw new Error("AI response missing required fields");
  }

  const obj = parsed as Record<string, unknown>;
  const action = obj.action as PortfolioRecommendationAction;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  return {
    action: input.ruleResult.hardLocked ? input.ruleResult.action : action,
    rationale: obj.rationale as string,
    intendedBuyPrice: num(obj.intendedBuyPrice),
    intendedSellPrice: num(obj.intendedSellPrice),
    trimAtGainPercent: num(obj.trimAtGainPercent),
    generatedAt: new Date().toISOString(),
  };
}

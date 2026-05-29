import { strict as assert } from "node:assert";
import {
  determinePortfolioRecommendation,
  type RecommendationRuleInput,
} from "@/lib/portfolio-recommendations";

const base: RecommendationRuleInput = {
  isHeld: true,
  currentPrice: 100,
  intendedBuyPrice: null,
  intendedSellPrice: null,
  trimAtGainPercent: null,
  globalGainThresholdPercent: 25,
  unrealizedGainPercent: null,
  rangeStatus: "on-target",
  driftPercent: 0,
  forecastTargetPrice: null,
  forecastHighCase: null,
  streetTargetMean: null,
  streetTargetHigh: null,
};

function action(input: Partial<RecommendationRuleInput>) {
  return determinePortfolioRecommendation({ ...base, ...input }).action;
}

assert.equal(
  action({ unrealizedGainPercent: 40, trimAtGainPercent: 30 }),
  "TRIM",
  "profitable holdings above trim threshold should trim",
);

assert.equal(
  action({ currentPrice: 150, forecastHighCase: 140 }),
  "SELL",
  "price above bull case should sell",
);

assert.equal(
  action({ rangeStatus: "underweight", driftPercent: -3 }),
  "BUY",
  "underweight positions should buy",
);

assert.equal(
  action({ isHeld: false, currentPrice: null }),
  "BUY",
  "target-only rows should buy",
);

assert.equal(
  action({
    currentPrice: 150,
    forecastHighCase: 140,
    unrealizedGainPercent: 80,
    trimAtGainPercent: 30,
    rangeStatus: "underweight",
    driftPercent: -5,
  }),
  "SELL",
  "sell should win priority conflicts over trim and buy",
);

console.log("portfolio recommendation tests passed");

import { z } from "zod";
import { CURRENCY_CODES } from "./currencies";

const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((v) => CURRENCY_CODES.includes(v), {
    message: "Unsupported currency",
  });

const decimalString = z
  .string()
  .trim()
  .refine((v) => v.length > 0 && !Number.isNaN(Number(v)), {
    message: "Must be a number",
  });

const positiveDecimal = decimalString.refine((v) => Number(v) > 0, {
  message: "Must be greater than zero",
});

const nonNegativeDecimal = decimalString.refine((v) => Number(v) >= 0, {
  message: "Must be zero or greater",
});

// ─── Portfolio ────────────────────────────────────────────────

export const portfolioSchema = z.object({
  groupId: z.string().min(1).optional().default("default"),
  name: z.string().trim().min(1, "Name is required").max(100),
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v?.length ? v : null)),
  baseCurrency: currencySchema,
});

export type PortfolioInput = z.infer<typeof portfolioSchema>;

// ─── Portfolio Group ──────────────────────────────────────────

export const portfolioGroupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v?.length ? v : null)),
  baseCurrency: currencySchema,
});

export type PortfolioGroupInput = z.infer<typeof portfolioGroupSchema>;

// ─── Group target weights (sum-to-100) ────────────────────────

const percentString = decimalString.refine(
  (v) => Number(v) >= 0 && Number(v) <= 100,
  { message: "Must be between 0 and 100" },
);

export const groupTargetsSchema = z
  .object({
    cashTargetPercent: percentString,
    portfolios: z
      .array(
        z.object({
          portfolioId: z.string().min(1),
          targetPercent: percentString,
        }),
      )
      .min(0),
  })
  .refine(
    (d) => {
      const sum =
        Number(d.cashTargetPercent) +
        d.portfolios.reduce((acc, p) => acc + Number(p.targetPercent), 0);
      return Math.abs(sum - 100) < 0.0001;
    },
    {
      message: "Cash + portfolio targets must sum to 100%",
      path: ["cashTargetPercent"],
    },
  );

export type GroupTargetsInput = z.infer<typeof groupTargetsSchema>;

// ─── Portfolio targets (sum-to-100 across instruments) ────────

export const portfolioTargetsSchema = z
  .object({
    portfolioId: z.string().min(1),
    targets: z
      .array(
        z.object({
          instrumentId: z.string().min(1),
          targetPercent: percentString,
          intendedBuyPrice: positiveDecimal.optional().nullable(),
          intendedSellPrice: positiveDecimal.optional().nullable(),
          trimAtGainPercent: nonNegativeDecimal.optional().nullable(),
          notes: z
            .string()
            .trim()
            .max(500)
            .optional()
            .transform((v) => (v?.length ? v : null)),
        }),
      )
      .min(0),
  })
  .refine(
    (d) => {
      if (d.targets.length === 0) return true;
      const sum = d.targets.reduce(
        (acc, t) => acc + Number(t.targetPercent),
        0,
      );
      return Math.abs(sum - 100) < 0.0001;
    },
    {
      message: "Holding targets must sum to 100%",
      path: ["targets"],
    },
  );

export type PortfolioTargetsInput = z.infer<typeof portfolioTargetsSchema>;

// ─── Cash transaction ─────────────────────────────────────────

export const cashTransactionTypeEnum = z.enum([
  "SEED",
  "DEPOSIT",
  "WITHDRAWAL",
]);

export const cashTransactionSchema = z.object({
  type: cashTransactionTypeEnum,
  amount: positiveDecimal,
  currency: currencySchema,
  date: z.coerce.date(),
  notes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v?.length ? v : null)),
});

export type CashTransactionInput = z.infer<typeof cashTransactionSchema>;

// ─── Trade ────────────────────────────────────────────────────

export const tradeSchema = z.object({
  portfolioId: z.string().min(1),
  yahooSymbol: z.string().trim().min(1, "Symbol is required"),
  type: z.enum(["BUY", "SELL"]),
  quantity: positiveDecimal,
  price: positiveDecimal,
  currency: currencySchema,
  fees: nonNegativeDecimal.optional().default("0"),
  date: z.coerce.date(),
  notes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => (v?.length ? v : null)),
});

export type TradeInput = z.infer<typeof tradeSchema>;

// ─── Alert ────────────────────────────────────────────────────

export const alertTypeEnum = z.enum([
  "PRICE_ABOVE",
  "PRICE_BELOW",
  "PCT_CHANGE",
  "REVIEW_TIMER",
  "ALLOCATION_DRIFT",
  "DIVIDEND_EVENT",
  "EARNINGS_EVENT",
  "FORECAST_DEVIATION",
]);

export const alertSchema = z
  .object({
    type: alertTypeEnum,
    portfolioId: z.string().min(1).nullable().optional(),
    instrumentId: z.string().min(1).nullable().optional(),
    priceTarget: decimalString.optional().nullable(),
    pctChange: decimalString.optional().nullable(),
    reviewIntervalDays: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .nullable(),
    allocationThreshold: decimalString.optional().nullable(),
    forecastId: z.string().min(1).nullable().optional(),
    deviationThreshold: decimalString.optional().nullable(),
    message: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((v) => (v?.length ? v : null)),
  })
  .refine(
    (data) => {
      switch (data.type) {
        case "PRICE_ABOVE":
        case "PRICE_BELOW":
          return !!data.priceTarget && !!data.instrumentId;
        case "PCT_CHANGE":
          return !!data.pctChange && !!data.instrumentId;
        case "REVIEW_TIMER":
          return !!data.reviewIntervalDays;
        case "ALLOCATION_DRIFT":
          return !!data.allocationThreshold && !!data.portfolioId;
        case "FORECAST_DEVIATION":
          return (
            !!data.deviationThreshold &&
            !!data.instrumentId &&
            !!data.forecastId
          );
        case "DIVIDEND_EVENT":
        case "EARNINGS_EVENT":
          return !!data.instrumentId;
      }
    },
    { message: "Required fields missing for this alert type" },
  );

export type AlertInput = z.infer<typeof alertSchema>;

// ─── Price target (user-drawn chart target) ──────────────────

export const priceTargetSchema = z
  .object({
    instrumentId: z.string().min(1),
    mode: z.enum(["PRICE", "PERCENT"]),
    value: decimalString,
    note: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((v) => (v?.length ? v : null)),
  })
  .refine((d) => Number(d.value) !== 0, {
    message: "Value cannot be zero",
    path: ["value"],
  })
  .refine((d) => d.mode !== "PRICE" || Number(d.value) > 0, {
    message: "Price must be greater than zero",
    path: ["value"],
  });

export type PriceTargetInput = z.infer<typeof priceTargetSchema>;

// ─── Review ───────────────────────────────────────────────────

export const reviewActionSchema = z.object({
  action: z.enum(["HOLD", "BUY", "SELL", "WATCH", "OTHER"]),
  notes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v?.length ? v : null)),
});

export type ReviewActionInput = z.infer<typeof reviewActionSchema>;

// ─── Stock Note ───────────────────────────────────────────────

export const stockNoteSchema = z.object({
  instrumentId: z.string().min(1),
  content: z.string().trim().min(1, "Note cannot be empty").max(10_000),
});

export type StockNoteInput = z.infer<typeof stockNoteSchema>;

// ─── Settings ─────────────────────────────────────────────────

export const watchlistAiModelEnum = z.enum(["gpt-5.4", "gpt-5.4-mini"]);

export type WatchlistAiModel = z.infer<typeof watchlistAiModelEnum>;

export const watchlistAiReasoningEnum = z.enum([
  "minimal",
  "low",
  "medium",
  "high",
]);

export type WatchlistAiReasoning = z.infer<typeof watchlistAiReasoningEnum>;

export const settingsSchema = z.object({
  defaultBaseCurrency: currencySchema,
  pushEnabled: z.boolean().optional().default(false),
  watchlistAiModel: watchlistAiModelEnum.optional().default("gpt-5.4"),
  watchlistAiReasoning: watchlistAiReasoningEnum.optional().default("medium"),
});

export type SettingsInput = z.infer<typeof settingsSchema>;

// ─── Watchlist ────────────────────────────────────────────────

export const watchlistItemSchema = z
  .object({
    yahooSymbol: z.string().trim().min(1, "Symbol is required"),
    buyRangeLow: decimalString.optional().nullable(),
    buyRangeHigh: decimalString.optional().nullable(),
    notes: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .transform((v) => (v?.length ? v : null)),
  })
  .refine(
    (d) =>
      !d.buyRangeLow ||
      !d.buyRangeHigh ||
      Number(d.buyRangeHigh) > Number(d.buyRangeLow),
    { message: "High must exceed low", path: ["buyRangeHigh"] },
  );

export type WatchlistItemInput = z.infer<typeof watchlistItemSchema>;

export const buyRangeSchema = z
  .object({
    buyRangeLow: positiveDecimal,
    buyRangeHigh: positiveDecimal,
  })
  .refine((d) => Number(d.buyRangeHigh) > Number(d.buyRangeLow), {
    message: "High must exceed low",
    path: ["buyRangeHigh"],
  });

export type BuyRangeInput = z.infer<typeof buyRangeSchema>;

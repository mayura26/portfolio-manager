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
  groupId: z.string().min(1, "Group is required"),
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
  investmentObjective: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v?.length ? v : null)),
  riskTolerance: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v?.length ? v : null)),
  timeHorizon: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v?.length ? v : null)),
  liquidityNeed: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v?.length ? v : null)),
  investmentProfileNotes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => (v?.length ? v : null)),
});

export type PortfolioGroupInput = z.infer<typeof portfolioGroupSchema>;

// ─── Group target weights (sum-to-100) ────────────────────────

const percentString = decimalString.refine(
  (v) => Number(v) >= 0 && Number(v) <= 100,
  { message: "Must be between 0 and 100" },
);

const targetRangeFields = {
  targetMinPercent: percentString,
  targetMaxPercent: percentString,
};

export const groupTargetsSchema = z
  .object({
    cashTargetMinPercent: percentString,
    cashTargetMaxPercent: percentString,
    portfolios: z
      .array(
        z
          .object({
            portfolioId: z.string().min(1),
            ...targetRangeFields,
          })
          .refine(
            (d) => Number(d.targetMinPercent) <= Number(d.targetMaxPercent),
            {
              message: "Min must be less than or equal to max",
              path: ["targetMaxPercent"],
            },
          )
          .transform((d) => ({
            ...d,
            targetPercent: (
              (Number(d.targetMinPercent) + Number(d.targetMaxPercent)) /
              2
            ).toString(),
          })),
      )
      .min(0),
  })
  .refine(
    (d) => Number(d.cashTargetMinPercent) <= Number(d.cashTargetMaxPercent),
    {
      message: "Cash min must be less than or equal to max",
      path: ["cashTargetMaxPercent"],
    },
  )
  .refine(
    (d) => {
      const minSum =
        Number(d.cashTargetMinPercent) +
        d.portfolios.reduce((acc, p) => acc + Number(p.targetMinPercent), 0);
      const maxSum =
        Number(d.cashTargetMaxPercent) +
        d.portfolios.reduce((acc, p) => acc + Number(p.targetMaxPercent), 0);
      return minSum <= 100.0001 && maxSum >= 99.9999;
    },
    {
      message: "Target ranges must allow a total allocation of 100%",
      path: ["cashTargetMinPercent"],
    },
  )
  .transform((d) => ({
    cashTargetMinPercent: d.cashTargetMinPercent,
    cashTargetMaxPercent: d.cashTargetMaxPercent,
    cashTargetPercent: (
      (Number(d.cashTargetMinPercent) + Number(d.cashTargetMaxPercent)) /
      2
    ).toString(),
    portfolios: d.portfolios,
  }));

export type GroupTargetsInput = z.infer<typeof groupTargetsSchema>;

// ─── Portfolio targets (sum-to-100 across instruments) ────────

export const portfolioTargetsSchema = z
  .object({
    portfolioId: z.string().min(1),
    targets: z
      .array(
        z
          .object({
            instrumentId: z.string().min(1),
            intendedBuyPrice: positiveDecimal.optional().nullable(),
            intendedSellPrice: positiveDecimal.optional().nullable(),
            trimAtGainPercent: nonNegativeDecimal.optional().nullable(),
            recommendationAction: z.enum(["BUY", "SELL", "TRIM"]),
            recommendationSource: z.enum(["MANUAL", "AI"]).optional(),
            recommendationRationale: z
              .string()
              .trim()
              .max(1000)
              .optional()
              .transform((v) => (v?.length ? v : null)),
            recommendationGeneratedAt: z
              .string()
              .trim()
              .optional()
              .transform((v) => (v?.length ? v : null)),
            recommendationModel: z
              .string()
              .trim()
              .max(100)
              .optional()
              .transform((v) => (v?.length ? v : null)),
            recommendationReasoningEffort: z
              .string()
              .trim()
              .max(30)
              .optional()
              .transform((v) => (v?.length ? v : null)),
            notes: z
              .string()
              .trim()
              .max(500)
              .optional()
              .transform((v) => (v?.length ? v : null)),
            ...targetRangeFields,
          })
          .refine(
            (d) => Number(d.targetMinPercent) <= Number(d.targetMaxPercent),
            {
              message: "Min must be less than or equal to max",
              path: ["targetMaxPercent"],
            },
          )
          .transform((d) => ({
            ...d,
            targetPercent: (
              (Number(d.targetMinPercent) + Number(d.targetMaxPercent)) /
              2
            ).toString(),
          })),
      )
      .min(0),
  })
  .refine(
    (d) => {
      if (d.targets.length === 0) return true;
      const minSum = d.targets.reduce(
        (acc, t) => acc + Number(t.targetMinPercent),
        0,
      );
      const maxSum = d.targets.reduce(
        (acc, t) => acc + Number(t.targetMaxPercent),
        0,
      );
      return minSum <= 100.0001 && maxSum >= 99.9999;
    },
    {
      message: "Holding target ranges must allow a total allocation of 100%",
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

export const reviewActionSchema = z
  .object({
    action: z.enum(["HOLD", "BUY", "SELL", "WATCH", "ADJUST_TARGET", "OTHER"]),
    adjustedTargetPrice: positiveDecimal.optional().nullable(),
    notes: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .transform((v) => (v?.length ? v : null)),
  })
  .refine((d) => d.action !== "ADJUST_TARGET" || !!d.adjustedTargetPrice, {
    message: "New target price is required",
    path: ["adjustedTargetPrice"],
  });

export type ReviewActionInput = z.infer<typeof reviewActionSchema>;

// ─── Congress trades filters ──────────────────────────────────

export const congressFiltersSchema = z.object({
  days: z.coerce.number().int().positive().default(90),
  sector: z.string().optional(),
  ticker: z.string().trim().toUpperCase().optional(),
  transaction: z.enum(["Purchase", "Sale"]).optional(),
  page: z.coerce.number().int().positive().default(1),
});

export type CongressFilters = z.infer<typeof congressFiltersSchema>;

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
  minTradePercent: z.coerce.number().min(0).max(100).default(0.5),
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

// ─── Portfolio Review / Weekly Report ─────────────────────────

export const auditCheckKeySchema = z.string().trim().min(1).max(200);

export const weekStartSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date (YYYY-MM-DD)");

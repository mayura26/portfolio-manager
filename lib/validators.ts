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
]);

export const alertSchema = z
  .object({
    type: alertTypeEnum,
    portfolioId: z.string().min(1).nullable().optional(),
    instrumentId: z.string().min(1).nullable().optional(),
    priceTarget: decimalString.optional().nullable(),
    pctChange: decimalString.optional().nullable(),
    reviewIntervalDays: z.coerce.number().int().positive().optional().nullable(),
    allocationThreshold: decimalString.optional().nullable(),
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
        case "DIVIDEND_EVENT":
        case "EARNINGS_EVENT":
          return !!data.instrumentId;
      }
    },
    { message: "Required fields missing for this alert type" },
  );

export type AlertInput = z.infer<typeof alertSchema>;

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

export const settingsSchema = z.object({
  defaultBaseCurrency: currencySchema,
  pushEnabled: z.boolean().optional().default(false),
});

export type SettingsInput = z.infer<typeof settingsSchema>;

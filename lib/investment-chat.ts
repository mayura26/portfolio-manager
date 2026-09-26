import { z } from "zod";

export type InvestmentChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export const investmentChatSchema = z.object({
  groupId: z.string().min(1).max(200),
  cashToInvest: z.number().positive().finite(),
  allocation: z.object({
    strategy: z.string().max(20000),
    allocations: z
      .array(
        z.object({
          symbol: z.string().max(200),
          name: z.string().max(500),
          portfolioName: z.string().max(500),
          suggestedAmount: z.number().nonnegative().finite(),
          rationale: z.string().max(10000),
          priority: z.enum(["primary", "secondary"]),
        }),
      )
      .max(10),
    totalAllocated: z.number().nonnegative().finite(),
    cashRetained: z.number().nonnegative().finite(),
    cashRetainedReason: z.string().max(20000).nullable(),
    generatedAt: z.string().datetime(),
  }),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(20000),
      }),
    )
    .min(1)
    .max(39)
    .refine(
      (messages) =>
        messages.every(
          (message, index) =>
            message.role === (index % 2 === 0 ? "user" : "assistant") &&
            (message.role !== "user" || message.content.length <= 2000),
        ) && messages.at(-1)?.role === "user",
    ),
});

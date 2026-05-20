import type { Prisma } from "@/app/generated/prisma/client";

/** Normal app views ignore hidden IBKR cleanup trades. */
export const visibleTradeWhere: Prisma.TradeWhereInput = {
  isHidden: false,
};

/** Hide IBKR "Unassigned" bucket when it has no visible trades. */
export const excludeEmptyUnassignedWhere: Prisma.PortfolioWhereInput = {
  NOT: {
    AND: [{ name: "Unassigned" }, { trades: { none: visibleTradeWhere } }],
  },
};

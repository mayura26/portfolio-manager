import type { Prisma } from "@/app/generated/prisma/client";

/** Hide IBKR "Unassigned" bucket when it has no trades (still in DB for Flex routing). */
export const excludeEmptyUnassignedWhere: Prisma.PortfolioWhereInput = {
  NOT: {
    AND: [{ name: "Unassigned" }, { trades: { none: {} } }],
  },
};

import type { Prisma } from "@/app/generated/prisma/client";
import { visibleTradeWhere } from "@/lib/portfolio-visibility";

export const trackedInstrumentWhere: Prisma.InstrumentWhereInput = {
  OR: [
    { trades: { some: visibleTradeWhere } },
    { targets: { some: {} } },
    { watchlistItems: { some: { status: "WATCHING" } } },
  ],
};

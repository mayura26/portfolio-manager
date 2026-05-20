import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { visibleTradeWhere } from "@/lib/portfolio-visibility";
import {
  buildSimplyWallStExportRows,
  createSimplyWallStWorkbook,
  sanitizeExportFilename,
} from "@/lib/simply-wall-st-export";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/groups/[groupId]/simply-wall-st">,
) {
  const { groupId } = await context.params;

  const group = await db.portfolioGroup.findUnique({
    where: { id: groupId },
    select: { name: true },
  });

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const trades = await db.trade.findMany({
    where: { ...visibleTradeWhere, portfolio: { groupId } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    include: {
      instrument: {
        select: {
          symbol: true,
          yahooSymbol: true,
          exchange: true,
          name: true,
        },
      },
    },
  });

  const rows = buildSimplyWallStExportRows(trades);
  const workbook = await createSimplyWallStWorkbook(rows);
  const filename = `${sanitizeExportFilename(group.name)}-simply-wall-st.xlsx`;

  return new Response(workbook, {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Cache-Control": "no-store",
    },
  });
}

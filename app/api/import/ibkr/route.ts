import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseIbkrCsv } from "@/lib/import/ibkr-csv";
import { importCashToGroup, importTrades } from "@/lib/import/ibkr-engine";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid form data" },
      { status: 400 },
    );
  }

  const portfolioId = formData.get("portfolioId");
  const file = formData.get("file");

  if (typeof portfolioId !== "string" || !portfolioId.trim()) {
    return NextResponse.json(
      { ok: false, error: "portfolioId is required" },
      { status: 400 },
    );
  }

  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "file is required" },
      { status: 400 },
    );
  }

  let csvText: string;
  try {
    csvText = await file.text();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not read file" },
      { status: 400 },
    );
  }

  let statement;
  try {
    statement = parseIbkrCsv(csvText);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: `CSV parse error: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 422 },
    );
  }

  const { trades, cashTxs } = statement;

  if (trades.length === 0 && cashTxs.length === 0) {
    return NextResponse.json({
      ok: true,
      inserted: 0,
      skipped: 0,
      cashInserted: 0,
      cashSkipped: 0,
      failed: [],
      message: "No trades or cash transactions found in this file",
    });
  }

  try {
    // Import trades into the selected portfolio
    const tradeResult = await importTrades(trades, portfolioId.trim());

    // Import cash transactions into the portfolio's group
    let cashInserted = 0;
    let cashSkipped = 0;
    if (cashTxs.length > 0) {
      const portfolio = await db.portfolio.findUnique({
        where: { id: portfolioId.trim() },
        select: { groupId: true },
      });
      if (portfolio) {
        const cashResult = await importCashToGroup(cashTxs, portfolio.groupId);
        cashInserted = cashResult.cashInserted;
        cashSkipped = cashResult.cashSkipped;
      }
    }

    return NextResponse.json({
      ok: true,
      ...tradeResult,
      cashInserted,
      cashSkipped,
    });
  } catch (err) {
    console.error("[import/ibkr]", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Import failed",
      },
      { status: 500 },
    );
  }
}

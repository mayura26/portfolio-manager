import { type NextRequest, NextResponse } from "next/server";
import { parseIbkrCsv } from "@/lib/import/ibkr-csv";
import { importTrades } from "@/lib/import/ibkr-engine";

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

  let trades;
  try {
    trades = parseIbkrCsv(csvText);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: `CSV parse error: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 422 },
    );
  }

  if (trades.length === 0) {
    return NextResponse.json({
      ok: true,
      inserted: 0,
      skipped: 0,
      failed: [],
      message: "No stock trades found in this file",
    });
  }

  try {
    const result = await importTrades(trades, portfolioId.trim());
    return NextResponse.json({ ok: true, ...result });
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

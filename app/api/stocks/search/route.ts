import { type NextRequest, NextResponse } from "next/server";
import { searchSymbols } from "@/lib/yahoo";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  if (q.trim().length < 1) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await searchSymbols(q, 10);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("[stocks/search]", err);
    return NextResponse.json({ error: "Search failed" }, { status: 502 });
  }
}

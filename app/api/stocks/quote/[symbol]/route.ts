import { type NextRequest, NextResponse } from "next/server";
import { fetchQuotes } from "@/lib/yahoo";

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/stocks/quote/[symbol]">,
) {
  const { symbol } = await ctx.params;
  const decoded = decodeURIComponent(symbol);

  try {
    const quotes = await fetchQuotes([decoded]);
    if (quotes.length === 0) {
      return NextResponse.json(
        { error: "Quote not available" },
        { status: 404 },
      );
    }
    return NextResponse.json({ quote: quotes[0] });
  } catch (err) {
    console.error("[stocks/quote]", err);
    return NextResponse.json({ error: "Quote lookup failed" }, { status: 502 });
  }
}

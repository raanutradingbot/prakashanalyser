import { NextResponse, type NextRequest } from "next/server";
import { getIntradayChart } from "@/lib/service";
import { normalizeSymbol } from "@/lib/symbols";
import { INTRADAY_RANGES, type IntradayRange } from "@/lib/types";
import { RateLimiter } from "@/lib/cache";
import { DataProviderError } from "@/lib/data";

export const dynamic = "force-dynamic";

const limiter = new RateLimiter(Number(process.env.RATE_LIMIT_PER_MINUTE || 30));

/**
 * GET /api/intraday?symbol=AAPL&range=15m
 * Sub-daily bars for the chart's intraday views (15m/30m/1H/4H). See getIntradayChart.
 */
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!limiter.allow(ip)) {
    return NextResponse.json({ error: "Too many requests. Please wait a minute." }, { status: 429 });
  }

  const params = req.nextUrl.searchParams;
  const symbol = normalizeSymbol(params.get("symbol") || "");
  if (!symbol) {
    return NextResponse.json({ error: "Enter a valid US ticker, e.g. AAPL, SPY or BRK.B." }, { status: 400 });
  }
  const rawRange = params.get("range") || "";
  const match = INTRADAY_RANGES.find((r) => r.toLowerCase() === rawRange.toLowerCase());
  if (!match) {
    return NextResponse.json({ error: `range must be one of ${INTRADAY_RANGES.join(", ")}.` }, { status: 400 });
  }
  const range: IntradayRange = match;

  try {
    const bars = await getIntradayChart(symbol, range);
    return NextResponse.json({ symbol, range, bars }, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (err) {
    if (err instanceof DataProviderError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json({ error: "Something went wrong fetching the intraday chart." }, { status: 500 });
  }
}

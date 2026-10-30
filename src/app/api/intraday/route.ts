import { NextResponse, type NextRequest } from "next/server";
import { getIntradayChart } from "@/lib/service";
import { normalizeSymbol } from "@/lib/symbols";
import { RateLimiter } from "@/lib/cache";
import { DataProviderError } from "@/lib/data";

export const dynamic = "force-dynamic";

const limiter = new RateLimiter(Number(process.env.RATE_LIMIT_PER_MINUTE || 30));

/**
 * GET /api/intraday?symbol=AAPL&range=1D
 * Sub-daily bars for the chart's 1D/1W views. See getIntradayChart.
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
  const rangeParam = (params.get("range") || "").toUpperCase();
  if (rangeParam !== "1D" && rangeParam !== "1W") {
    return NextResponse.json({ error: "range must be 1D or 1W." }, { status: 400 });
  }
  const range = rangeParam;

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

import { NextResponse, type NextRequest } from "next/server";
import { getAnalysis } from "@/lib/service";
import { normalizeSymbol, parseRange } from "@/lib/symbols";
import { RateLimiter } from "@/lib/cache";
import { DataProviderError } from "@/lib/data";
import { AnalysisError } from "@/lib/analyze";

// Defense-in-depth: see the comment in src/app/movers/page.tsx. This route
// already behaved correctly throughout testing (its use of
// req.nextUrl.searchParams already makes Next.js treat it as dynamic), but
// there's no reason to leave it implicit.
export const dynamic = "force-dynamic";

const limiter = new RateLimiter(Number(process.env.RATE_LIMIT_PER_MINUTE || 30));

/**
 * GET /api/analyze?symbol=AAPL&range=1Y&ai=1&news=1
 * Returns the full AnalysisResult as JSON.
 */
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!limiter.allow(ip)) {
    return NextResponse.json({ error: "Too many requests. Please wait a minute." }, { status: 429 });
  }

  const params = req.nextUrl.searchParams;
  const symbol = normalizeSymbol(params.get("symbol") || "");
  if (!symbol) {
    return NextResponse.json(
      { error: "Enter a valid US ticker, e.g. AAPL, SPY or BRK.B." },
      { status: 400 },
    );
  }
  const range = parseRange(params.get("range"));

  try {
    const result = await getAnalysis(symbol, range, {
      ai: params.get("ai") === "1",
      news: params.get("news") === "1",
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (err) {
    if (err instanceof DataProviderError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof AnalysisError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error(err);
    return NextResponse.json({ error: "Something went wrong analyzing this ticker." }, { status: 500 });
  }
}

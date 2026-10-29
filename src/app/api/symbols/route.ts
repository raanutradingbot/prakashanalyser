import { NextResponse, type NextRequest } from "next/server";
import { getProvider } from "@/lib/data";
import { SYMBOL_INDEX, searchSymbolIndex } from "@/lib/data/symbolIndex";
import { RateLimiter, TtlCache } from "@/lib/cache";
import type { SymbolHit } from "@/lib/types";

// Defense-in-depth: see the comment in src/app/movers/page.tsx.
export const dynamic = "force-dynamic";

const limiter = new RateLimiter(120);
const cache = new TtlCache<SymbolHit[]>(5 * 60 * 1000);

/**
 * GET /api/symbols?q=appl
 * Ticker/company-name search for the search box's autocomplete dropdown.
 */
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!limiter.allow(ip)) {
    return NextResponse.json({ error: "Too many requests. Please wait a minute." }, { status: 429 });
  }

  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 1) return NextResponse.json({ results: [] });

  const provider = getProvider();
  const key = `${provider.id}:${q.toUpperCase()}`;
  const cached = cache.get(key);
  if (cached) return NextResponse.json({ results: cached }, { headers: { "Cache-Control": "private, max-age=30" } });

  let results: SymbolHit[] = [];
  if (provider.searchSymbols) {
    results = await provider.searchSymbols(q, 8).catch(() => []);
  }
  if (results.length === 0) {
    results = searchSymbolIndex(SYMBOL_INDEX, q, 8);
  }

  cache.set(key, results);
  return NextResponse.json({ results }, { headers: { "Cache-Control": "private, max-age=30" } });
}

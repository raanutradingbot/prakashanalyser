// Debug tool for screener data-integrity issues: runs getVolatilityMovers()
// directly against real .env.local config (not through Next.js at all) and
// prints whether specific symbols appear, with their full data, for manual
// sanity-checking against the live Alpaca API.
//
// This was the key tool that ruled out a concurrency bug when production
// showed wrong prices for /movers: running the exact same scan this way,
// outside Next's build/request pipeline, always returned correct data —
// which pointed the investigation toward something Next.js-specific
// (eventually found: missing `dynamic = "force-dynamic"` let the build step
// execute the page once using build-time demo data, which then got served
// at runtime — see the fix in src/app/movers/page.tsx).
//
// Needs tsx's path alias for "server-only" (which throws when imported
// outside a real Next.js server-component tree) pointed at a no-op stub —
// see tsconfig.debug.json / server-only-stub.ts alongside this file.
//
// Usage:
//   TSX_TSCONFIG_PATH=scripts/tsconfig.debug.json npx tsx scripts/debug-screener.mjs [SYMBOL...]
import { readFileSync } from "node:fs";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const { getVolatilityMovers } = await import("../src/lib/screener.ts");

const watchSymbols = process.argv.slice(2);
const { bullish, bearish } = await getVolatilityMovers(50);
const all = [...bullish, ...bearish];

console.log(`Total: ${bullish.length} bullish, ${bearish.length} bearish`);
for (const sym of watchSymbols.length ? watchSymbols : ["WAT", "KR"]) {
  const hit = all.find((h) => h.symbol === sym);
  console.log(`${sym}:`, hit || "(not present in result — filtered out or didn't qualify)");
}

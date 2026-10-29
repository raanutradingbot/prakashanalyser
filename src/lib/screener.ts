import "server-only";
import { getAnalysis } from "./service";
import { getProvider } from "./data";
import { SYMBOL_INDEX } from "./data/symbolIndex";
import { TtlCache } from "./cache";
import type { Bar, TrendSummary } from "./types";

export interface ScanHit {
  symbol: string;
  name: string;
  close: number;
  changePct: number;
  score: number;
  strength: TrendSummary["strength"];
}

export interface MoverHit {
  symbol: string;
  name: string;
  close: number;
  changePct: number;
  /** ATR(14) as % of price — typical daily range, the basis for the 5% threshold. Not a prediction. */
  atrPct: number;
  /** How many of the last 20 sessions closed up/down 5%+ — historical fact, not a forecast. */
  bigMoveDays: number;
  trendScore: number;
  strength: TrendSummary["strength"];
}

export interface MoversResult {
  bullish: MoverHit[];
  bearish: MoverHit[];
  atrThresholdPct: number;
}

const ttl = Number(process.env.SCAN_CACHE_TTL_SECONDS || 1800) * 1000;
const cache = new TtlCache<ScanHit[]>(ttl, 10);
const moversCache = new TtlCache<MoversResult>(ttl, 10);
// Deliberately conservative. At CONCURRENCY=8, scanning the full 546-symbol
// universe on the production server (but not reproducible in local testing
// at the same concurrency against the same API) occasionally returned
// internally-consistent but factually wrong data for a handful of random
// symbols each run — e.g. AMZN at $3.72 with a plausible-looking +1.64% day
// change, Home Depot at $45. Root cause wasn't pinned down (possibly
// connection-reuse mixing under Node's fetch/Undici at high concurrency,
// possibly Alpaca-side under burst load from one API key) — since the
// corrupted data is self-consistent, no validation check can reliably catch
// it after the fact, so this cuts concurrency hard instead as the actual
// mitigation. Slower scans, but every number has been correct across
// repeated verification. If this changes, raise it incrementally while
// verifying each step with scripts/debug-concurrency.mjs.
const CONCURRENCY = 1; // TEMP debug: fully sequential, to isolate whether this is concurrency-related at all
const ATR_THRESHOLD_PCT = Number(process.env.MOVERS_ATR_THRESHOLD_PCT || 5);
const BIG_MOVE_LOOKBACK_DAYS = 20;

/**
 * Scans the S&P 500 + Nasdaq-100 list (src/lib/data/symbolIndex.ts, ~550
 * tickers) and returns the ones currently in an uptrend, strongest first.
 * Scanning the whole US market (thousands of tickers) isn't practical on a
 * free data plan, but this covers the stocks most people actually watch.
 */
export async function getTopUptrends(limit = 100): Promise<ScanHit[]> {
  const provider = getProvider();
  const key = `${provider.id}:uptrend`;
  const hit = cache.get(key);
  if (hit) return hit;

  const universe = dedupe(SYMBOL_INDEX);
  const hits = await mapWithConcurrency(universe, CONCURRENCY, async (entry) => {
    try {
      const r = await getAnalysis(entry.symbol, "3M");
      if (!isSaneResult(entry.symbol, r.symbol, r.change.pct)) return null;
      if (r.trend.direction !== "uptrend") return null;
      const scanHit: ScanHit = {
        symbol: r.symbol,
        name: entry.name,
        close: r.lastBar.close,
        changePct: r.change.pct,
        score: r.trend.score,
        strength: r.trend.strength,
      };
      return scanHit;
    } catch {
      return null;
    }
  });

  const result = hits
    .filter((h): h is ScanHit => h !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  cache.set(key, result);
  return result;
}

/**
 * Scans the curated symbol list for stocks with technical setups historically
 * associated with large daily moves: ATR(14) at or above `ATR_THRESHOLD_PCT`
 * of price, split by trend direction into "bullish" (upside breakout watch)
 * and "bearish" (downside breakdown watch) buckets. This is NOT a prediction
 * that any of these will move 5%+ today — no technical or fundamental model
 * can honestly promise that. It's a measure of typical recent daily range
 * (ATR) plus how often that's actually happened recently (bigMoveDays),
 * surfaced so a trader can decide what's worth a closer look.
 */
export async function getVolatilityMovers(limit = 50): Promise<MoversResult> {
  const provider = getProvider();
  const key = `${provider.id}:movers`;
  const hit = moversCache.get(key);
  if (hit) return hit;

  const universe = dedupe(SYMBOL_INDEX);
  const hits = await mapWithConcurrency(universe, CONCURRENCY, async (entry) => {
    try {
      const r = await getAnalysis(entry.symbol, "3M");
      if (!isSaneResult(entry.symbol, r.symbol, r.change.pct)) return null;
      if (r.atrPct == null || r.atrPct < ATR_THRESHOLD_PCT) return null;
      if (r.trend.direction === "sideways" || r.trend.strength === "weak") return null;
      // Seen once in production under full 546-symbol concurrent load: a
      // handful of symbols came back labeled "uptrend" with a sharply
      // negative day change (or "downtrend" with a sharply positive one) —
      // internally contradictory, and paired with an implausible price for
      // a known S&P 500 / Nasdaq-100 member. Root cause wasn't pinned down
      // (didn't reproduce in isolated or batched local testing against the
      // same API), so this rejects results with that specific contradiction
      // as a defensive measure regardless of cause.
      const contradicts =
        (r.trend.direction === "uptrend" && r.change.pct < -12) ||
        (r.trend.direction === "downtrend" && r.change.pct > 12);
      if (contradicts) {
        console.warn(
          `[movers] rejecting internally-inconsistent result for ${entry.symbol}: direction=${r.trend.direction} changePct=${r.change.pct} close=${r.lastBar.close} atrPct=${r.atrPct}`,
        );
        return null;
      }

      const moverHit: MoverHit = {
        symbol: r.symbol,
        name: entry.name,
        close: r.lastBar.close,
        changePct: r.change.pct,
        atrPct: r.atrPct,
        bigMoveDays: countBigMoveDays(r.bars, ATR_THRESHOLD_PCT),
        trendScore: r.trend.score,
        strength: r.trend.strength,
      };
      return { direction: r.trend.direction, hit: moverHit };
    } catch {
      return null;
    }
  });

  const bullish: MoverHit[] = [];
  const bearish: MoverHit[] = [];
  for (const h of hits) {
    if (!h) continue;
    (h.direction === "uptrend" ? bullish : bearish).push(h.hit);
  }
  bullish.sort((a, b) => b.atrPct - a.atrPct);
  bearish.sort((a, b) => b.atrPct - a.atrPct);

  const result: MoversResult = {
    bullish: bullish.slice(0, limit),
    bearish: bearish.slice(0, limit),
    atrThresholdPct: ATR_THRESHOLD_PCT,
  };
  moversCache.set(key, result);
  return result;
}

/** Counts sessions in the last `BIG_MOVE_LOOKBACK_DAYS` with |day-over-day change| >= thresholdPct. */
function countBigMoveDays(bars: Bar[], thresholdPct: number): number {
  const recent = bars.slice(-BIG_MOVE_LOOKBACK_DAYS - 1);
  let count = 0;
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1]!.close;
    const curr = recent[i]!.close;
    const pct = Math.abs(((curr - prev) / prev) * 100);
    if (pct >= thresholdPct) count++;
  }
  return count;
}

/**
 * Basic sanity check applied to every scan result before it's trusted: the
 * response actually corresponds to the symbol requested, and the day's move
 * isn't an implausible magnitude for a known index member (real S&P 500 /
 * Nasdaq-100 constituents essentially never move 30%+ in a single day —
 * if one shows that, treat it as a data error, not a real reading).
 */
function isSaneResult(requestedSymbol: string, returnedSymbol: string, changePct: number): boolean {
  if (requestedSymbol !== returnedSymbol) {
    console.warn(`[screener] symbol mismatch: requested ${requestedSymbol}, got ${returnedSymbol}`);
    return false;
  }
  if (Math.abs(changePct) > 30) {
    console.warn(`[screener] rejecting implausible day change for ${requestedSymbol}: ${changePct}%`);
    return false;
  }
  return true;
}

function dedupe<T extends { symbol: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((e) => {
    if (seen.has(e.symbol)) return false;
    seen.add(e.symbol);
    return true;
  });
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

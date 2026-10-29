import "server-only";
import { getAnalysis } from "./service";
import { getProvider } from "./data";
import { SYMBOL_INDEX } from "./data/symbolIndex";
import { TtlCache } from "./cache";
import type { TrendSummary } from "./types";

export interface ScanHit {
  symbol: string;
  name: string;
  close: number;
  changePct: number;
  score: number;
  strength: TrendSummary["strength"];
}

const ttl = Number(process.env.SCAN_CACHE_TTL_SECONDS || 1800) * 1000;
const cache = new TtlCache<ScanHit[]>(ttl, 10);
const CONCURRENCY = 8;

/**
 * Scans the curated symbol list (src/lib/data/symbolIndex.ts) and returns the
 * ones currently in an uptrend, strongest first. Scanning the whole US market
 * isn't practical on a free data plan, so this covers ~170 well-known names —
 * good enough for "stocks worth a look," not a full screener.
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

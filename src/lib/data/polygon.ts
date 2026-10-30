import type { NewsItem, SymbolHit } from "../types";
import { DataProviderError, SymbolNotFoundError, type IntradayTimeframe, type MarketDataProvider } from "./provider";
import { toEasternDate, toInstant } from "./time";

type PolygonAgg = { t: number; o: number; h: number; l: number; c: number; v: number };

async function fetchAggs(
  base: string,
  key: string,
  symbol: string,
  multiplier: number,
  timespan: string,
  from: Date,
  to: Date,
): Promise<PolygonAgg[]> {
  const f = timespan === "day" ? from.toISOString().slice(0, 10) : from.toISOString();
  const t = timespan === "day" ? to.toISOString().slice(0, 10) : to.toISOString();
  const url = new URL(`${base}/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/${multiplier}/${timespan}/${f}/${t}`);
  url.searchParams.set("adjusted", "true");
  url.searchParams.set("sort", "asc");
  url.searchParams.set("limit", "50000");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {
    throw new DataProviderError("Couldn't reach the market data service. Try again in a moment.", 503);
  });
  if (res.status === 404) throw new SymbolNotFoundError(symbol);
  if (res.status === 429) throw new DataProviderError("Market data rate limit reached. Try again shortly.", 429);
  if (!res.ok) throw new DataProviderError(`Polygon returned HTTP ${res.status}.`);

  const json = (await res.json()) as { results?: PolygonAgg[] };
  return json.results ?? [];
}

/**
 * Polygon.io aggregates (the service is also branded Massive; set
 * POLYGON_BASE_URL if you use the new host).
 * https://polygon.io/docs/rest/stocks/aggregates/custom-bars
 */
export function polygonProvider(): MarketDataProvider {
  const key = process.env.POLYGON_API_KEY;
  const base = (process.env.POLYGON_BASE_URL || "https://api.polygon.io").replace(/\/$/, "");
  if (!key) throw new DataProviderError("Polygon is selected but POLYGON_API_KEY is not set.", 500);

  return {
    id: "polygon",
    label: "Polygon.io",
    async getDailyBars(symbol, from, to) {
      const results = await fetchAggs(base, key, symbol, 1, "day", from, to);
      const bars = results.map((b) => ({
        time: toEasternDate(new Date(b.t)),
        open: b.o,
        high: b.h,
        low: b.l,
        close: b.c,
        volume: b.v,
      }));
      if (bars.length === 0) throw new SymbolNotFoundError(symbol);
      return bars;
    },

    async getIntradayBars(symbol, timeframe: IntradayTimeframe, from, to) {
      const [multiplier, timespan] = timeframe === "15Min" ? [15, "minute"] : [1, "hour"];
      const results = await fetchAggs(base, key, symbol, multiplier, timespan, from, to);
      const bars = results.map((b) => ({
        time: toInstant(new Date(b.t)),
        open: b.o,
        high: b.h,
        low: b.l,
        close: b.c,
        volume: b.v,
      }));
      if (bars.length === 0) throw new SymbolNotFoundError(symbol);
      return bars;
    },

    async getNews(symbol, limit) {
      const url = new URL(`${base}/v2/reference/news`);
      url.searchParams.set("ticker", symbol);
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("order", "desc");
      url.searchParams.set("sort", "published_utc");

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null);
      if (!res || !res.ok) return [];

      const json = (await res.json()) as {
        results?: { title: string; article_url: string; publisher?: { name?: string }; published_utc: string; description?: string }[];
      };
      return (json.results ?? []).map(
        (n): NewsItem => ({
          headline: n.title,
          url: n.article_url,
          source: n.publisher?.name || "Polygon",
          publishedAt: n.published_utc,
          summary: n.description || undefined,
        }),
      );
    },

    async searchSymbols(query, limit) {
      const q = query.trim();
      if (!q) return [];
      const url = new URL(`${base}/v3/reference/tickers`);
      url.searchParams.set("search", q);
      url.searchParams.set("active", "true");
      url.searchParams.set("market", "stocks");
      url.searchParams.set("limit", String(limit));

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null);
      if (!res || !res.ok) return [];

      const json = (await res.json()) as { results?: { ticker: string; name: string }[] };
      return (json.results ?? []).map((r): SymbolHit => ({ symbol: r.ticker, name: r.name }));
    },
  };
}

import type { Bar, NewsItem, SymbolHit } from "../types";
import { DataProviderError, SymbolNotFoundError, type MarketDataProvider } from "./provider";
import { searchSymbolIndex } from "./symbolIndex";
import { toEasternDate } from "./time";

let assetCache: { entries: SymbolHit[]; expires: number } | null = null;

/**
 * Alpaca Market Data v2 — https://docs.alpaca.markets/reference/stockbars
 * Free accounts get the IEX feed; set ALPACA_FEED=sip on a paid plan for
 * consolidated volume from all US exchanges.
 */
export function alpacaProvider(): MarketDataProvider {
  const keyId = process.env.ALPACA_API_KEY_ID;
  const secret = process.env.ALPACA_API_SECRET_KEY;
  const feed = process.env.ALPACA_FEED || "iex";
  if (!keyId || !secret) {
    throw new DataProviderError("Alpaca is selected but ALPACA_API_KEY_ID / ALPACA_API_SECRET_KEY are not set.", 500);
  }

  return {
    id: "alpaca",
    label: `Alpaca (${feed.toUpperCase()} feed)`,
    async getDailyBars(symbol, from, to) {
      const bars: Bar[] = [];
      let pageToken: string | undefined;
      do {
        const url = new URL(`https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars`);
        url.searchParams.set("timeframe", "1Day");
        url.searchParams.set("start", from.toISOString().slice(0, 10));
        url.searchParams.set("end", to.toISOString().slice(0, 10));
        url.searchParams.set("adjustment", "all");
        url.searchParams.set("feed", feed);
        url.searchParams.set("limit", "10000");
        url.searchParams.set("sort", "asc");
        if (pageToken) url.searchParams.set("page_token", pageToken);

        const res = await fetch(url, {
          headers: { "APCA-API-KEY-ID": keyId, "APCA-API-SECRET-KEY": secret },
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        }).catch(() => {
          throw new DataProviderError("Couldn't reach the market data service. Try again in a moment.", 503);
        });
        if (res.status === 404 || res.status === 422) throw new SymbolNotFoundError(symbol);
        if (res.status === 429) throw new DataProviderError("Market data rate limit reached. Try again shortly.", 429);
        if (!res.ok) throw new DataProviderError(`Alpaca returned HTTP ${res.status}.`);

        const json = (await res.json()) as {
          bars: { t: string; o: number; h: number; l: number; c: number; v: number }[] | null;
          next_page_token?: string | null;
        };
        for (const b of json.bars ?? []) {
          bars.push({ time: toEasternDate(new Date(b.t)), open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v });
        }
        pageToken = json.next_page_token ?? undefined;
      } while (pageToken);

      if (bars.length === 0) throw new SymbolNotFoundError(symbol);
      return bars;
    },

    async getNews(symbol, limit) {
      const url = new URL("https://data.alpaca.markets/v1beta1/news");
      url.searchParams.set("symbols", symbol);
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("sort", "desc");
      url.searchParams.set("exclude_contentless", "true");

      const res = await fetch(url, {
        headers: { "APCA-API-KEY-ID": keyId, "APCA-API-SECRET-KEY": secret },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null);
      if (!res || !res.ok) return [];

      const json = (await res.json()) as {
        news?: { headline: string; url: string; source: string; created_at: string; summary?: string }[];
      };
      return (json.news ?? []).map(
        (n): NewsItem => ({
          headline: n.headline,
          url: n.url,
          source: n.source,
          publishedAt: n.created_at,
          summary: n.summary || undefined,
        }),
      );
    },

    async searchSymbols(query, limit) {
      if (!assetCache || assetCache.expires < Date.now()) {
        // Asset listing lives on the Trading API (live or paper host, same key either works
        // for one of the two depending on which kind of key you generated).
        const hosts = ["https://api.alpaca.markets", "https://paper-api.alpaca.markets"];
        let entries: SymbolHit[] = [];
        for (const host of hosts) {
          const url = new URL(`${host}/v2/assets`);
          url.searchParams.set("status", "active");
          url.searchParams.set("asset_class", "us_equity");
          const res = await fetch(url, {
            headers: { "APCA-API-KEY-ID": keyId, "APCA-API-SECRET-KEY": secret },
            signal: AbortSignal.timeout(15_000),
          }).catch(() => null);
          if (res && res.ok) {
            const json = (await res.json()) as { symbol: string; name: string; tradable: boolean; status: string }[];
            entries = json.filter((a) => a.tradable && a.status === "active").map((a) => ({ symbol: a.symbol, name: a.name }));
            break;
          }
        }
        assetCache = { entries, expires: Date.now() + 24 * 60 * 60 * 1000 };
      }
      return searchSymbolIndex(assetCache.entries, query, limit);
    },
  };
}

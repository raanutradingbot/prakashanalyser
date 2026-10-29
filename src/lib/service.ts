import "server-only";
import type { AnalysisResult, Bar, NewsItem, Range } from "./types";
import { analyze, calendarDaysFor } from "./analyze";
import { getProvider } from "./data";
import { TtlCache } from "./cache";
import { writeSummary } from "./ai";

const ttl = Number(process.env.CACHE_TTL_SECONDS || 300) * 1000;
const barCache = new TtlCache<Bar[]>(ttl);
const aiCache = new TtlCache<string | null>(6 * 60 * 60 * 1000);
const newsCache = new TtlCache<NewsItem[]>(Number(process.env.NEWS_CACHE_TTL_SECONDS || 900) * 1000);

/** Fetch, analyze and (optionally) summarize/fetch news. Shared by the page and the JSON API. */
export async function getAnalysis(
  symbol: string,
  range: Range,
  opts: { ai?: boolean; news?: boolean } = {},
): Promise<AnalysisResult> {
  const provider = getProvider();
  // Always fetch the longest range we serve so all ranges share one cache entry.
  const key = `${provider.id}:${symbol}`;
  let bars = barCache.get(key);
  if (!bars) {
    const to = new Date();
    const from = new Date(to.getTime() - calendarDaysFor("5Y") * 86_400_000);
    bars = await provider.getDailyBars(symbol, from, to);
    barCache.set(key, bars);
  }

  const result = analyze(symbol, bars, range, provider.label);

  let aiSummary: string | null = null;
  if (opts.ai) {
    const aiKey = `${symbol}:${range}:${result.lastBar.time}`;
    const hit = aiCache.get(aiKey);
    if (hit !== undefined) aiSummary = hit;
    else {
      aiSummary = await writeSummary(result);
      if (aiSummary) aiCache.set(aiKey, aiSummary);
    }
  }

  let news: NewsItem[] | null = null;
  if (opts.news && provider.getNews) {
    const newsKey = `${provider.id}:${symbol}`;
    const hit = newsCache.get(newsKey);
    if (hit) news = hit;
    else {
      news = await provider.getNews(symbol, 5).catch(() => []);
      newsCache.set(newsKey, news);
    }
  }

  return { ...result, aiSummary, news };
}

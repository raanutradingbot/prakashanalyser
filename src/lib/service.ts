import "server-only";
import type { AnalysisResult, Bar, DailyRange, IntradayRange, NewsItem } from "./types";
import { analyze, calendarDaysFor } from "./analyze";
import { getProvider, DataProviderError } from "./data";
import { TtlCache } from "./cache";
import { writeSummary } from "./ai";

const ttl = Number(process.env.CACHE_TTL_SECONDS || 300) * 1000;
const barCache = new TtlCache<Bar[]>(ttl);
const aiCache = new TtlCache<string | null>(6 * 60 * 60 * 1000);
const newsCache = new TtlCache<NewsItem[]>(Number(process.env.NEWS_CACHE_TTL_SECONDS || 900) * 1000);
const intradayTtl = Number(process.env.INTRADAY_CACHE_TTL_SECONDS || 60) * 1000;
const intradayCache = new TtlCache<Bar[]>(intradayTtl);

/** Fetch, analyze and (optionally) summarize/fetch news. Shared by the page and the JSON API. */
export async function getAnalysis(
  symbol: string,
  range: DailyRange,
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

/**
 * Sub-daily bars for the 1D/1W chart views. "1D" returns just the most
 * recent trading session's bars; "1W" returns the last 5 trading days'. The
 * trend analysis itself (verdict, signals, levels) stays on the daily
 * dataset from getAnalysis — only the chart switches resolution here.
 */
export async function getIntradayChart(symbol: string, range: IntradayRange): Promise<Bar[]> {
  const provider = getProvider();
  if (!provider.getIntradayBars) {
    throw new DataProviderError(`${provider.label} doesn't support intraday charts yet.`, 501);
  }

  const key = `${provider.id}:${symbol}:${range}`;
  const cached = intradayCache.get(key);
  if (cached) return cached;

  const timeframe = range === "1D" ? "15Min" : "1Hour";
  const to = new Date();
  // Buffer wide enough to guarantee a full session/week even across
  // weekends and holidays; trimmed down to the actual requested window below.
  const bufferDays = range === "1D" ? 5 : 12;
  const from = new Date(to.getTime() - bufferDays * 86_400_000);

  const bars = await provider.getIntradayBars(symbol, timeframe, from, to);
  const trimmed = trimToRecentSessions(bars, range === "1D" ? 1 : 5);
  intradayCache.set(key, trimmed);
  return trimmed;
}

/** Keeps only the bars from the most recent `sessions` distinct trading days present in `bars`. */
function trimToRecentSessions(bars: Bar[], sessions: number): Bar[] {
  const days = [...new Set(bars.map((b) => b.time.slice(0, 10)))].sort();
  const keep = new Set(days.slice(-sessions));
  return bars.filter((b) => keep.has(b.time.slice(0, 10)));
}

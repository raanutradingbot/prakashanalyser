import type { Bar, NewsItem } from "../types";
import type { MarketDataProvider } from "./provider";
import { SYMBOL_INDEX, searchSymbolIndex } from "./symbolIndex";

/**
 * Deterministic synthetic US-equity data for local development and demos.
 * Each symbol gets its own seed, so AAPL always looks the same, and prices
 * follow a regime-switching random walk with realistic intraday ranges.
 * Weekends and major US market holidays are skipped.
 */
export const demoProvider: MarketDataProvider = {
  id: "demo",
  label: "Demo data (synthetic)",
  async getDailyBars(symbol, from, to) {
    return generateBars(symbol, from, lastCompletedSession(to));
  },
  async getNews(symbol, limit) {
    return generateNews(symbol, limit);
  },
  async searchSymbols(query, limit) {
    return searchSymbolIndex(SYMBOL_INDEX, query, limit);
  },
};

const HEADLINE_TEMPLATES = [
  "{s} shares move with the broader market in quiet trading",
  "What to watch for {s} heading into the next session",
  "{s} options activity picks up ahead of upcoming catalysts",
  "Analysts weigh in on {s}'s recent price action",
  "{s} trades near key technical levels this week",
  "Sector rotation puts {s} and peers in focus",
  "{s} volume ticks up as traders reposition",
];

/** Synthetic placeholder headlines, clearly labeled — not real news. */
function generateNews(symbol: string, limit: number): NewsItem[] {
  const rand = mulberry32(hash(`news:${symbol}`));
  const now = Date.now();
  const items: NewsItem[] = [];
  let hoursAgo = 2 + Math.floor(rand() * 6);
  for (let i = 0; i < limit; i++) {
    const template = HEADLINE_TEMPLATES[Math.floor(rand() * HEADLINE_TEMPLATES.length)]!;
    items.push({
      headline: template.replace("{s}", symbol),
      url: "#",
      source: "Demo feed (not real news)",
      publishedAt: new Date(now - hoursAgo * 3_600_000).toISOString(),
    });
    hoursAgo += 3 + Math.floor(rand() * 18);
  }
  return items;
}

/** Today only counts once the 4:00 pm ET close has passed. */
function lastCompletedSession(now: Date): Date {
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const d = new Date(Date.UTC(et.getFullYear(), et.getMonth(), et.getDate()));
  if (et.getHours() < 16) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

export function generateBars(symbol: string, from: Date, to: Date): Bar[] {
  const rand = mulberry32(hash(symbol));
  // Start the walk well before `from` so the series is stable regardless of range.
  const origin = new Date(Date.UTC(2015, 0, 2));
  let price = 20 + rand() * 280;
  let drift = 0.0004;
  let vol = 0.012 + rand() * 0.014;
  const baseVolume = 2e6 + rand() * 4e7;
  const bars: Bar[] = [];
  let regimeLeft = 0;

  for (let d = new Date(origin); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    if (!isTradingDay(d)) continue;
    if (regimeLeft-- <= 0) {
      regimeLeft = 30 + Math.floor(rand() * 120);
      drift = (rand() - 0.42) * 0.0035;
      vol = Math.max(0.007, vol * (0.7 + rand() * 0.6));
    }
    const ret = drift + vol * gaussian(rand);
    const open = price * (1 + vol * 0.3 * gaussian(rand));
    const close = Math.max(1, price * (1 + ret));
    const spread = Math.abs(gaussian(rand)) * vol * price * 0.8 + price * 0.002;
    const high = Math.max(open, close) + spread * rand();
    const low = Math.max(0.5, Math.min(open, close) - spread * rand());
    const volume = Math.round(baseVolume * (0.6 + rand() * 0.8) * (1 + Math.abs(ret) * 25));
    price = close;
    if (d >= from) {
      bars.push({
        time: d.toISOString().slice(0, 10),
        open: r2(open),
        high: r2(high),
        low: r2(low),
        close: r2(close),
        volume,
      });
    }
  }
  return bars;
}

const FIXED_HOLIDAYS = new Set(["01-01", "06-19", "07-04", "12-25"]);

function isTradingDay(d: Date): boolean {
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return false;
  return !FIXED_HOLIDAYS.has(d.toISOString().slice(5, 10));
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number) {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

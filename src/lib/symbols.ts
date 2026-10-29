import { RANGES, type Range } from "./types";

/**
 * US listed tickers: 1–5 letters, optionally a share-class suffix
 * A–D (BRK.B, BF-B → BRK.B / BF.B). Foreign suffixes like
 * ".NS" or ".L" are rejected because this app covers US markets only.
 */
const US_TICKER = /^[A-Z]{1,5}(\.[A-D])?$/;

export function normalizeSymbol(input: string): string | null {
  const s = input.trim().toUpperCase().replace(/^\$/, "").replace(/[-/]/g, ".");
  return US_TICKER.test(s) ? s : null;
}

export function parseRange(input: string | null | undefined): Range {
  const r = (input || "").toUpperCase();
  return (RANGES as string[]).includes(r) ? (r as Range) : "1Y";
}

/** Popular US names for quick picks on the home page. */
export const POPULAR = [
  { symbol: "SPY", name: "SPDR S&P 500 ETF" },
  { symbol: "QQQ", name: "Invesco QQQ Trust" },
  { symbol: "AAPL", name: "Apple" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "NVDA", name: "NVIDIA" },
  { symbol: "AMZN", name: "Amazon" },
  { symbol: "TSLA", name: "Tesla" },
  { symbol: "JPM", name: "JPMorgan Chase" },
  { symbol: "IWM", name: "iShares Russell 2000" },
  { symbol: "XLE", name: "Energy Select SPDR" },
];

/**
 * One OHLCV bar. `time` is either a YYYY-MM-DD date string (daily bars, in
 * US/Eastern trading-date terms) or a full ISO instant with time-of-day
 * (intraday bars, e.g. "2026-10-29T14:30:00.000Z") — the chart ranges that
 * use intraday bars are IntradayRange ("15m" | "30m" | "1H" | "4H");
 * everything else uses daily bars.
 */
export interface Bar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type DailyRange = "3M" | "6M" | "1Y" | "2Y" | "5Y";
export type IntradayRange = "15m" | "30m" | "1H" | "4H" | "1D" | "1W";
export type Range = IntradayRange | DailyRange;
export const DAILY_RANGES: DailyRange[] = ["3M", "6M", "1Y", "2Y", "5Y"];
// Ordered minutes -> hours -> day -> week, then DAILY_RANGES continues month -> year.
export const INTRADAY_RANGES: IntradayRange[] = ["15m", "30m", "1H", "4H", "1D", "1W"];
export const RANGES: Range[] = [...INTRADAY_RANGES, ...DAILY_RANGES];
export const isIntradayRange = (r: Range): r is IntradayRange => (INTRADAY_RANGES as string[]).includes(r);

export type TrendDirection = "uptrend" | "downtrend" | "sideways";
export type Bias = "bullish" | "bearish" | "neutral";

export interface Signal {
  name: string;
  value: string;
  bias: Bias;
  note: string;
}

export interface Level {
  price: number;
  kind: "support" | "resistance";
  touches: number;
  /** 0–1, combines touches and recency */
  strength: number;
  distancePct: number;
}

export interface PatternHit {
  time: string;
  name: string;
  bias: Bias;
  description: string;
}

export interface SymbolHit {
  symbol: string;
  name: string;
}

export interface NewsItem {
  headline: string;
  url: string;
  source: string;
  publishedAt: string;
  summary?: string;
}

export interface TrendSummary {
  direction: TrendDirection;
  /** -100 (strongly bearish) … +100 (strongly bullish) */
  score: number;
  strength: "weak" | "moderate" | "strong";
  headline: string;
  /** Each factor's explanation and its vote (-1 bearish … +1 bullish). */
  reasons: { text: string; vote: number }[];
}

export interface SeriesPoint {
  time: string;
  value: number;
}

/** Latest buy/sell EMA-crossover signal with ATR-based TP/SL levels. See src/lib/tpsl.ts. */
export interface TpSlSignal {
  direction: "buy" | "sell";
  time: string;
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
  slHit: boolean;
}

export interface AnalysisResult {
  symbol: string;
  range: DailyRange;
  provider: string;
  generatedAt: string;
  lastBar: Bar;
  change: { abs: number; pct: number };
  periodChangePct: number;
  high52w: number | null;
  low52w: number | null;
  /** ATR(14) as a percentage of the last close — a measure of typical daily range, not a prediction. */
  atrPct: number | null;
  trend: TrendSummary;
  signals: Signal[];
  levels: Level[];
  patterns: PatternHit[];
  bars: Bar[];
  overlays: {
    sma20: SeriesPoint[];
    sma50: SeriesPoint[];
    sma200: SeriesPoint[];
  };
  rsi: SeriesPoint[];
  tpSl: TpSlSignal | null;
  aiSummary?: string | null;
  news?: NewsItem[] | null;
}

import type { AnalysisResult, Bar, Bias, Range, SeriesPoint, Signal } from "./types";
import { atr, bollinger, last, macd, rsi, sma, type Series } from "./indicators";
import { findLevels } from "./levels";
import { detectPatterns } from "./patterns";
import { classifyTrend } from "./trend";

/** Approximate US trading sessions per range. */
export const RANGE_BARS: Record<Range, number> = {
  "3M": 63,
  "6M": 126,
  "1Y": 252,
  "2Y": 504,
  "5Y": 1260,
};

/** Extra history fetched so the 200-day average is valid from the first displayed bar. */
export const WARMUP_BARS = 260;

export function calendarDaysFor(range: Range): number {
  // ~1.45 calendar days per trading session, plus warm-up.
  return Math.ceil((RANGE_BARS[range] + WARMUP_BARS) * 1.45) + 10;
}

/**
 * Turns raw daily bars into a full analysis. `bars` should include warm-up
 * history; only the last RANGE_BARS[range] are returned for display.
 */
export function analyze(
  symbol: string,
  bars: Bar[],
  range: Range,
  provider: string,
): Omit<AnalysisResult, "aiSummary"> {
  if (bars.length < 30) {
    throw new AnalysisError(`Not enough price history for ${symbol} to analyze (need at least 30 sessions).`);
  }
  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const volumes = bars.map((b) => b.volume);

  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const rsi14 = rsi(closes, 14);
  const m = macd(closes);
  const bb = bollinger(closes, 20, 2);
  const atr14 = atr(highs, lows, closes, 14);
  const vol20 = sma(volumes, 20);

  const lastBar = bars[bars.length - 1]!;
  const prevBar = bars[bars.length - 2] ?? lastBar;
  const price = lastBar.close;

  const displayCount = Math.min(RANGE_BARS[range], bars.length);
  const startIdx = bars.length - displayCount;
  const displayBars = bars.slice(startIdx);

  const atrNow = last(atr14);
  const trend = classifyTrend({
    symbol,
    bars,
    sma20,
    sma50,
    sma200,
    rsi: rsi14,
    macdHist: m.histogram,
    macdLine: m.macd,
    atr: atrNow,
  });

  const levelBars = bars.slice(-Math.max(displayCount, 126));
  const levels = findLevels(levelBars, { atr: atrNow });
  const patterns = detectPatterns(bars, 20);

  const yearBars = bars.slice(-252);
  const high52w = yearBars.length >= 200 ? Math.max(...yearBars.map((b) => b.high)) : null;
  const low52w = yearBars.length >= 200 ? Math.min(...yearBars.map((b) => b.low)) : null;

  const signals = buildSignals({
    price,
    sma20: last(sma20),
    sma50: last(sma50),
    sma200: last(sma200),
    rsi: last(rsi14),
    macdLine: last(m.macd),
    macdSignal: last(m.signal),
    macdHist: last(m.histogram),
    bbUpper: last(bb.upper),
    bbLower: last(bb.lower),
    atr: atrNow,
    volume: lastBar.volume,
    avgVolume: last(vol20),
    high52w,
    low52w,
  });

  const toPoints = (s: Series): SeriesPoint[] => {
    const out: SeriesPoint[] = [];
    for (let i = startIdx; i < bars.length; i++) {
      const v = s[i];
      if (v != null) out.push({ time: bars[i]!.time, value: round(v) });
    }
    return out;
  };

  const first = displayBars[0]!;
  return {
    symbol,
    range,
    provider,
    generatedAt: new Date().toISOString(),
    lastBar,
    change: {
      abs: round(price - prevBar.close),
      pct: round(((price - prevBar.close) / prevBar.close) * 100),
    },
    periodChangePct: round(((price - first.close) / first.close) * 100),
    high52w,
    low52w,
    trend,
    signals,
    levels: levels.map((l) => ({ ...l, price: round(l.price) })),
    patterns,
    bars: displayBars,
    overlays: { sma20: toPoints(sma20), sma50: toPoints(sma50), sma200: toPoints(sma200) },
    rsi: toPoints(rsi14),
  };
}

export class AnalysisError extends Error {}

interface SignalInputs {
  price: number;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi: number | null;
  macdLine: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  bbUpper: number | null;
  bbLower: number | null;
  atr: number | null;
  volume: number;
  avgVolume: number | null;
  high52w: number | null;
  low52w: number | null;
}

function buildSignals(x: SignalInputs): Signal[] {
  const s: Signal[] = [];

  if (x.sma20 != null && x.sma50 != null && x.sma200 != null) {
    const bullStack = x.price > x.sma20 && x.sma20 > x.sma50 && x.sma50 > x.sma200;
    const bearStack = x.price < x.sma20 && x.sma20 < x.sma50 && x.sma50 < x.sma200;
    s.push({
      name: "Moving averages",
      value: bullStack ? "Bullish stack" : bearStack ? "Bearish stack" : "Mixed",
      bias: bullStack ? "bullish" : bearStack ? "bearish" : "neutral",
      note: `20-day ${usd(x.sma20)}, 50-day ${usd(x.sma50)}, 200-day ${usd(x.sma200)}`,
    });
  }

  if (x.rsi != null) {
    let bias: Bias = "neutral";
    let note = "Momentum is balanced.";
    if (x.rsi >= 70) {
      bias = "bearish";
      note = "Overbought — rallies this stretched often pause or pull back.";
    } else if (x.rsi <= 30) {
      bias = "bullish";
      note = "Oversold — selling may be exhausted; watch for a bounce.";
    } else if (x.rsi >= 55) {
      bias = "bullish";
      note = "Buyers have the upper hand.";
    } else if (x.rsi <= 45) {
      bias = "bearish";
      note = "Sellers have the upper hand.";
    }
    s.push({ name: "RSI (14)", value: x.rsi.toFixed(1), bias, note });
  }

  if (x.macdLine != null && x.macdSignal != null && x.macdHist != null) {
    const above = x.macdLine > x.macdSignal;
    s.push({
      name: "MACD (12,26,9)",
      value: `${x.macdHist >= 0 ? "+" : ""}${x.macdHist.toFixed(2)}`,
      bias: above ? "bullish" : "bearish",
      note: above ? "MACD is above its signal line." : "MACD is below its signal line.",
    });
  }

  if (x.bbUpper != null && x.bbLower != null) {
    const pctB = (x.price - x.bbLower) / (x.bbUpper - x.bbLower || 1);
    const width = ((x.bbUpper - x.bbLower) / x.price) * 100;
    let bias: Bias = "neutral";
    let note = `Bands are ${width.toFixed(1)}% wide.`;
    if (pctB > 1) {
      bias = "bullish";
      note = "Closing above the upper band — strong push, but stretched.";
    } else if (pctB < 0) {
      bias = "bearish";
      note = "Closing below the lower band — strong selling, but stretched.";
    } else if (width < 6) {
      note = `Bands are tight (${width.toFixed(1)}%) — a volatility squeeze often precedes a bigger move.`;
    }
    s.push({ name: "Bollinger %B", value: pctB.toFixed(2), bias, note });
  }

  if (x.atr != null) {
    const pct = (x.atr / x.price) * 100;
    s.push({
      name: "Volatility (ATR 14)",
      value: `${usd(x.atr)} (${pct.toFixed(1)}%)`,
      bias: "neutral",
      note:
        pct < 1.5
          ? "Low daily volatility."
          : pct < 3.5
            ? "Typical daily volatility."
            : "High daily volatility — expect large swings.",
    });
  }

  if (x.avgVolume != null && x.avgVolume > 0) {
    const ratio = x.volume / x.avgVolume;
    s.push({
      name: "Volume vs 20d avg",
      value: `${ratio.toFixed(2)}×`,
      bias: "neutral",
      note:
        ratio >= 1.5
          ? "Unusually heavy volume — the latest move has conviction."
          : ratio <= 0.6
            ? "Light volume — the latest move has little participation."
            : "Normal participation.",
    });
  }

  if (x.high52w != null && x.low52w != null && x.high52w > x.low52w) {
    const pos = (x.price - x.low52w) / (x.high52w - x.low52w);
    s.push({
      name: "52-week range",
      value: `${Math.round(pos * 100)}%`,
      bias: pos >= 0.8 ? "bullish" : pos <= 0.2 ? "bearish" : "neutral",
      note: `Low ${usd(x.low52w)}, high ${usd(x.high52w)}`,
    });
  }

  return s;
}

function usd(n: number) {
  return `$${n.toFixed(2)}`;
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

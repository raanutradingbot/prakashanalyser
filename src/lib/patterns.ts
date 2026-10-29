import type { Bar, PatternHit } from "./types";

/**
 * Classic single-, double- and triple-candle patterns. Each detector is
 * deliberately conservative and uses the prior few bars for context so that,
 * e.g., a "hammer" is only reported after a decline.
 */

const body = (b: Bar) => Math.abs(b.close - b.open);
const range = (b: Bar) => Math.max(b.high - b.low, 1e-9);
const upperWick = (b: Bar) => b.high - Math.max(b.open, b.close);
const lowerWick = (b: Bar) => Math.min(b.open, b.close) - b.low;
const isBull = (b: Bar) => b.close > b.open;
const isBear = (b: Bar) => b.close < b.open;

/** Direction of the `n` bars before index i, by close-to-close change. */
function priorMove(bars: Bar[], i: number, n = 5): number {
  const start = bars[i - n];
  const end = bars[i - 1];
  if (!start || !end) return 0;
  return (end.close - start.close) / start.close;
}

type Detector = (bars: Bar[], i: number) => Omit<PatternHit, "time"> | null;

const detectors: Detector[] = [
  // Doji: tiny body relative to range
  (bars, i) => {
    const b = bars[i]!;
    if (body(b) / range(b) <= 0.08 && range(b) > 0) {
      return {
        name: "Doji",
        bias: "neutral",
        description: "Open and close nearly equal — indecision between buyers and sellers.",
      };
    }
    return null;
  },
  // Hammer (after decline) / Hanging man (after advance)
  (bars, i) => {
    const b = bars[i]!;
    const bd = body(b);
    if (bd / range(b) < 0.1 || bd / range(b) > 0.4) return null;
    if (lowerWick(b) < 2 * bd || upperWick(b) > bd * 0.6) return null;
    const move = priorMove(bars, i);
    if (move < -0.02)
      return {
        name: "Hammer",
        bias: "bullish",
        description: "Long lower wick after a decline — sellers pushed price down but buyers recovered it.",
      };
    if (move > 0.02)
      return {
        name: "Hanging Man",
        bias: "bearish",
        description: "Hammer-shaped candle after an advance — can warn that buying pressure is fading.",
      };
    return null;
  },
  // Shooting star (after advance) / Inverted hammer (after decline)
  (bars, i) => {
    const b = bars[i]!;
    const bd = body(b);
    if (bd / range(b) < 0.1 || bd / range(b) > 0.4) return null;
    if (upperWick(b) < 2 * bd || lowerWick(b) > bd * 0.6) return null;
    const move = priorMove(bars, i);
    if (move > 0.02)
      return {
        name: "Shooting Star",
        bias: "bearish",
        description: "Long upper wick after an advance — buyers were rejected at higher prices.",
      };
    if (move < -0.02)
      return {
        name: "Inverted Hammer",
        bias: "bullish",
        description: "Long upper wick after a decline — an early sign buyers are testing higher prices.",
      };
    return null;
  },
  // Engulfing
  (bars, i) => {
    const p = bars[i - 1];
    const b = bars[i]!;
    if (!p) return null;
    if (body(b) < range(b) * 0.5) return null;
    if (isBear(p) && isBull(b) && b.open <= p.close && b.close >= p.open && body(b) > body(p) && priorMove(bars, i) < 0)
      return {
        name: "Bullish Engulfing",
        bias: "bullish",
        description: "A strong up candle fully covers the prior down candle's body after a decline.",
      };
    if (isBull(p) && isBear(b) && b.open >= p.close && b.close <= p.open && body(b) > body(p) && priorMove(bars, i) > 0)
      return {
        name: "Bearish Engulfing",
        bias: "bearish",
        description: "A strong down candle fully covers the prior up candle's body after an advance.",
      };
    return null;
  },
  // Morning star / Evening star
  (bars, i) => {
    const a = bars[i - 2];
    const m = bars[i - 1];
    const c = bars[i]!;
    if (!a || !m) return null;
    const small = body(m) <= range(m) * 0.3 && body(m) < body(a) * 0.5;
    if (!small) return null;
    const midA = (a.open + a.close) / 2;
    if (isBear(a) && body(a) > range(a) * 0.5 && isBull(c) && c.close > midA && priorMove(bars, i - 1) < 0)
      return {
        name: "Morning Star",
        bias: "bullish",
        description: "Down candle, small pause candle, then a strong up candle — a three-bar reversal pattern.",
      };
    if (isBull(a) && body(a) > range(a) * 0.5 && isBear(c) && c.close < midA && priorMove(bars, i - 1) > 0)
      return {
        name: "Evening Star",
        bias: "bearish",
        description: "Up candle, small pause candle, then a strong down candle — a three-bar reversal pattern.",
      };
    return null;
  },
  // Three white soldiers / Three black crows
  (bars, i) => {
    const t = [bars[i - 2], bars[i - 1], bars[i]];
    if (t.some((x) => !x)) return null;
    const [x, y, z] = t as [Bar, Bar, Bar];
    const strong = (b: Bar) => body(b) >= range(b) * 0.6;
    if ([x, y, z].every((b) => isBull(b) && strong(b)) && y.close > x.close && z.close > y.close)
      return {
        name: "Three White Soldiers",
        bias: "bullish",
        description: "Three consecutive strong up candles, each closing higher — steady buying pressure.",
      };
    if ([x, y, z].every((b) => isBear(b) && strong(b)) && y.close < x.close && z.close < y.close)
      return {
        name: "Three Black Crows",
        bias: "bearish",
        description: "Three consecutive strong down candles, each closing lower — steady selling pressure.",
      };
    return null;
  },
];

/** Scan the most recent `lookback` bars. Returns newest first, one pattern per bar (strongest wins). */
export function detectPatterns(bars: Bar[], lookback = 20): PatternHit[] {
  const hits: PatternHit[] = [];
  const start = Math.max(5, bars.length - lookback);
  for (let i = bars.length - 1; i >= start; i--) {
    let chosen: Omit<PatternHit, "time"> | null = null;
    // Detectors are ordered by priority: later (multi-bar) patterns override earlier single-bar ones.
    for (const d of detectors) {
      const r = d(bars, i);
      if (r) chosen = r;
    }
    if (chosen) hits.push({ time: bars[i]!.time, ...chosen });
  }
  return hits;
}

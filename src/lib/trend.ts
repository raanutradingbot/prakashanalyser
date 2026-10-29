import type { Bar, TrendSummary } from "./types";
import { findPivots } from "./levels";
import { last, slopePct, type Series } from "./indicators";

interface TrendInputs {
  symbol: string;
  bars: Bar[];
  sma20: Series;
  sma50: Series;
  sma200: Series;
  rsi: Series;
  macdHist: Series;
  macdLine: Series;
  atr: number | null;
}

interface Factor {
  weight: number;
  /** -1 … +1 */
  value: number;
  reason?: string;
}

/**
 * Rule-based trend classification. Each factor votes between -1 and +1 and is
 * weighted; the weighted average becomes a -100…+100 score. Everything here is
 * transparent so the UI can show *why* a verdict was reached.
 */
export function classifyTrend(input: TrendInputs): TrendSummary {
  const { bars, symbol } = input;
  const closes = bars.map((b) => b.close);
  const price = closes[closes.length - 1]!;
  const s20 = last(input.sma20);
  const s50 = last(input.sma50);
  const s200 = last(input.sma200);
  const r = last(input.rsi);
  const h = last(input.macdHist);
  const m = last(input.macdLine);
  const factors: Factor[] = [];

  // Distance from an average counts in proportion to typical daily range (ATR),
  // so hovering just above/below a flat average isn't mistaken for a trend.
  const unit = input.atr && input.atr > 0 ? input.atr : price * 0.02;
  if (s50 != null) {
    const above = price > s50;
    factors.push({
      weight: 1.5,
      value: clamp((price - s50) / (2 * unit), -1, 1),
      reason: `Price is ${above ? "above" : "below"} its 50-day average (${fmt(s50)}).`,
    });
  }
  if (s200 != null) {
    const above = price > s200;
    factors.push({
      weight: 1.5,
      value: clamp((price - s200) / (4 * unit), -1, 1),
      reason: `Price is ${above ? "above" : "below"} its 200-day average (${fmt(s200)}).`,
    });
  }
  if (s50 != null && s200 != null) {
    const golden = s50 > s200;
    factors.push({
      weight: 1,
      value: golden ? 1 : -1,
      reason: golden
        ? "50-day average is above the 200-day (long-term structure is up)."
        : "50-day average is below the 200-day (long-term structure is down).",
    });
  }
  if (s20 != null && s50 != null) {
    factors.push({ weight: 0.5, value: s20 > s50 ? 1 : -1 });
  }

  // Slope of the 50-day average over the last 20 sessions.
  const s50vals = input.sma50.filter((v): v is number => v != null);
  const maSlope = slopePct(s50vals, Math.min(20, s50vals.length));
  if (maSlope != null) {
    const v = clamp(maSlope / 0.15, -1, 1); // 0.15%/day ≈ strong
    factors.push({
      weight: 1.5,
      value: v,
      reason:
        Math.abs(maSlope) < 0.02
          ? "The 50-day average is flat."
          : `The 50-day average is ${maSlope > 0 ? "rising" : "falling"} (${maSlope > 0 ? "+" : ""}${maSlope.toFixed(2)}%/day).`,
    });
  }

  // Regression slope of price over ~50 sessions.
  const pSlope = slopePct(closes, Math.min(50, closes.length));
  if (pSlope != null) factors.push({ weight: 1, value: clamp(pSlope / 0.2, -1, 1) });

  if (h != null && m != null) {
    const v = (h > 0 ? 0.5 : -0.5) + (m > 0 ? 0.5 : -0.5);
    factors.push({
      weight: 1,
      value: v,
      reason: `MACD momentum is ${h > 0 ? "improving" : "weakening"} and the MACD line is ${m > 0 ? "above" : "below"} zero.`,
    });
  }

  if (r != null) {
    const v = clamp((r - 50) / 20, -1, 1);
    let reason: string | undefined;
    if (r >= 70) reason = `RSI ${r.toFixed(0)} — strong momentum, but in overbought territory.`;
    else if (r <= 30) reason = `RSI ${r.toFixed(0)} — weak momentum, in oversold territory.`;
    factors.push({ weight: 1, value: v, reason });
  }

  const structure = swingStructure(bars);
  if (structure) factors.push(structure);

  const totalW = factors.reduce((a, f) => a + f.weight, 0) || 1;
  const score = Math.round((factors.reduce((a, f) => a + f.value * f.weight, 0) / totalW) * 100);
  const direction = score >= 25 ? "uptrend" : score <= -25 ? "downtrend" : "sideways";
  const abs = Math.abs(score);
  const strength = abs >= 65 ? "strong" : abs >= 40 ? "moderate" : "weak";

  const headline =
    direction === "sideways"
      ? `${symbol} is moving sideways with no clear trend`
      : `${symbol} is in a ${strength} ${direction}`;

  // Most informative reasons first: those that agree with the verdict.
  const sign = Math.sign(score) || 1;
  const reasons = factors
    .filter((f) => f.reason)
    .sort((a, b) => b.value * sign * b.weight - a.value * sign * a.weight)
    .map((f) => ({ text: f.reason!, vote: Number(f.value.toFixed(2)) }));

  return { direction, score, strength, headline, reasons };
}

/** Higher highs + higher lows => +1; lower highs + lower lows => -1. */
function swingStructure(bars: Bar[]): Factor | null {
  const recent = bars.slice(-120);
  const pivots = findPivots(recent, 3);
  const highs = pivots.filter((p) => p.type === "high").slice(-2);
  const lows = pivots.filter((p) => p.type === "low").slice(-2);
  if (highs.length < 2 || lows.length < 2) return null;
  const hh = highs[1]!.price > highs[0]!.price;
  const hl = lows[1]!.price > lows[0]!.price;
  if (hh && hl)
    return { weight: 1, value: 1, reason: "Recent swings show higher highs and higher lows." };
  if (!hh && !hl)
    return { weight: 1, value: -1, reason: "Recent swings show lower highs and lower lows." };
  return { weight: 1, value: 0, reason: "Recent swing highs and lows are mixed (consolidation)." };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function fmt(n: number) {
  return `$${n.toFixed(2)}`;
}

import type { Bar, TpSlSignal } from "./types";
import { atr, ema } from "./indicators";

/**
 * Replicates the "KN - Smart TP SL Signals" TradingView indicator
 * (open-source, by phamhaihoclt): a 5/13 EMA crossover signal with
 * ATR(14)-based stop loss and three risk-reward take-profit levels.
 * https://www.tradingview.com/script/Xmti9o4w-KN-Smart-TP-SL-Signals/
 *
 * BUY:  EMA(5) crosses above EMA(13). SL = close - ATR*1.5. TP(n) = close + ATR*1.5*n.
 * SELL: EMA(5) crosses below EMA(13). SL = close + ATR*1.5. TP(n) = close - ATR*1.5*n.
 */
const EMA_FAST = 5;
const EMA_SLOW = 13;
const ATR_LEN = 14;
const SL_ATR_MULT = 1.5;
const RR = [1, 2, 3] as const;

/** Finds the most recent EMA crossover in `bars` and its TP/SL levels, with
 *  whether each level has since been touched. Returns null if there isn't
 *  enough history yet or no crossover has occurred. */
export function findLatestTpSlSignal(bars: Bar[]): TpSlSignal | null {
  if (bars.length < EMA_SLOW + 2) return null;

  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const emaFast = ema(closes, EMA_FAST);
  const emaSlow = ema(closes, EMA_SLOW);
  const atrSeries = atr(highs, lows, closes, ATR_LEN);

  let signalIdx = -1;
  let direction: "buy" | "sell" | null = null;
  for (let i = 1; i < bars.length; i++) {
    const f0 = emaFast[i - 1];
    const s0 = emaSlow[i - 1];
    const f1 = emaFast[i];
    const s1 = emaSlow[i];
    if (f0 == null || s0 == null || f1 == null || s1 == null) continue;
    if (f0 <= s0 && f1 > s1) {
      signalIdx = i;
      direction = "buy";
    } else if (f0 >= s0 && f1 < s1) {
      signalIdx = i;
      direction = "sell";
    }
  }
  if (signalIdx === -1 || !direction) return null;

  const atrAtSignal = atrSeries[signalIdx];
  if (atrAtSignal == null) return null;

  const entry = bars[signalIdx]!.close;
  const risk = atrAtSignal * SL_ATR_MULT;
  const sign = direction === "buy" ? 1 : -1;
  const sl = entry - sign * risk;
  const [tp1, tp2, tp3] = RR.map((rr) => entry + sign * risk * rr) as [number, number, number];

  let tp1Hit = false;
  let tp2Hit = false;
  let tp3Hit = false;
  let slHit = false;
  for (let i = signalIdx; i < bars.length; i++) {
    const { high, low } = bars[i]!;
    if (direction === "buy") {
      if (high >= tp1) tp1Hit = true;
      if (high >= tp2) tp2Hit = true;
      if (high >= tp3) tp3Hit = true;
      if (low <= sl) slHit = true;
    } else {
      if (low <= tp1) tp1Hit = true;
      if (low <= tp2) tp2Hit = true;
      if (low <= tp3) tp3Hit = true;
      if (high >= sl) slHit = true;
    }
  }

  return {
    direction,
    time: bars[signalIdx]!.time,
    entry: round(entry),
    sl: round(sl),
    tp1: round(tp1),
    tp2: round(tp2),
    tp3: round(tp3),
    tp1Hit,
    tp2Hit,
    tp3Hit,
    slHit,
  };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

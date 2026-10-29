import type { Bar, Level } from "./types";

interface Pivot {
  index: number;
  price: number;
  type: "high" | "low";
}

/**
 * Swing highs/lows: a bar whose high (low) is the extreme of `window` bars on
 * each side. Ties are allowed on the right so equal neighbouring highs (common
 * in real data) still yield one pivot — the first bar of the tie.
 */
export function findPivots(bars: Bar[], window = 4): Pivot[] {
  const pivots: Pivot[] = [];
  for (let i = window; i < bars.length - window; i++) {
    const b = bars[i]!;
    let isHigh = true;
    let isLow = true;
    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue;
      const o = bars[j]!;
      if (j < i ? o.high >= b.high : o.high > b.high) isHigh = false;
      if (j < i ? o.low <= b.low : o.low < b.low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) pivots.push({ index: i, price: b.high, type: "high" });
    if (isLow) pivots.push({ index: i, price: b.low, type: "low" });
  }
  return pivots;
}

interface Cluster {
  prices: number[];
  indices: number[];
}

/**
 * Support & resistance: cluster pivot prices that sit within `tolerance`
 * (a fraction of price, derived from volatility) and score each cluster by
 * how many times price reacted there and how recently.
 */
export function findLevels(
  bars: Bar[],
  opts: { atr?: number | null; maxPerSide?: number; window?: number } = {},
): Level[] {
  if (bars.length < 20) return [];
  const lastClose = bars[bars.length - 1]!.close;
  const maxPerSide = opts.maxPerSide ?? 3;
  // Tolerance: ~0.75 ATR, clamped to 0.75%–3% of price.
  const atrPct = opts.atr ? (opts.atr / lastClose) * 0.75 : 0.015;
  const tol = Math.min(0.03, Math.max(0.0075, atrPct));

  const pivots = findPivots(bars, opts.window ?? 4).sort((a, b) => a.price - b.price);
  const clusters: Cluster[] = [];
  for (const p of pivots) {
    const c = clusters[clusters.length - 1];
    if (c) {
      const mean = c.prices.reduce((a, b) => a + b, 0) / c.prices.length;
      if (Math.abs(p.price - mean) / mean <= tol) {
        c.prices.push(p.price);
        c.indices.push(p.index);
        continue;
      }
    }
    clusters.push({ prices: [p.price], indices: [p.index] });
  }

  const n = bars.length;
  const levels: Level[] = clusters.map((c) => {
    const price = c.prices.reduce((a, b) => a + b, 0) / c.prices.length;
    const touches = c.prices.length;
    const mostRecent = Math.max(...c.indices);
    const recency = mostRecent / (n - 1); // 0 = oldest bar, 1 = newest
    const strength = Math.min(1, 0.25 * Math.min(touches, 4) * 0.7 + recency * 0.3);
    return {
      price,
      kind: price <= lastClose ? "support" : "resistance",
      touches,
      strength: Number(strength.toFixed(2)),
      distancePct: Number((((price - lastClose) / lastClose) * 100).toFixed(2)),
    };
  });

  const pick = (kind: Level["kind"]) =>
    levels
      .filter((l) => l.kind === kind)
      // Prefer strong levels, then proximity.
      .sort((a, b) => b.strength - a.strength || Math.abs(a.distancePct) - Math.abs(b.distancePct))
      .slice(0, maxPerSide)
      .sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct));

  return [...pick("resistance"), ...pick("support")];
}

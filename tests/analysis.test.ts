import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { analyze, RANGE_BARS } from "@/lib/analyze";
import { findLevels } from "@/lib/levels";
import { detectPatterns } from "@/lib/patterns";
import { generateBars } from "@/lib/data/demo";

function barsFromCloses(closes: number[], wick = 0.5): Bar[] {
  return closes.map((c, i) => {
    const o = i === 0 ? c : closes[i - 1]!;
    return {
      time: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10),
      open: o,
      high: Math.max(o, c) + wick,
      low: Math.min(o, c) - wick,
      close: c,
      volume: 1_000_000,
    };
  });
}

describe("trend classification", () => {
  it("calls a steady advance an uptrend", () => {
    const closes = Array.from({ length: 400 }, (_, i) => 50 + i * 0.25 + Math.sin(i / 3) * 0.8);
    const r = analyze("TEST", barsFromCloses(closes), "1Y", "test");
    expect(r.trend.direction).toBe("uptrend");
    expect(r.trend.score).toBeGreaterThan(60);
    expect(r.trend.reasons.length).toBeGreaterThan(2);
  });
  it("calls a steady decline a downtrend", () => {
    const closes = Array.from({ length: 400 }, (_, i) => 200 - i * 0.3 + Math.sin(i / 3) * 0.8);
    const r = analyze("TEST", barsFromCloses(closes), "1Y", "test");
    expect(r.trend.direction).toBe("downtrend");
    expect(r.trend.score).toBeLessThan(-60);
  });
  it("calls a flat oscillation sideways", () => {
    const closes = Array.from({ length: 400 }, (_, i) => 100 + Math.sin(i / 8) * 4);
    const r = analyze("TEST", barsFromCloses(closes), "1Y", "test");
    expect(r.trend.direction).toBe("sideways");
  });
});

describe("support and resistance", () => {
  it("finds the floor and ceiling of a trading range", () => {
    const closes = Array.from({ length: 200 }, (_, i) => 105 + Math.sin(i / 6) * 5);
    const bars = barsFromCloses(closes, 0.2);
    const levels = findLevels(bars, { atr: 1 });
    const res = levels.filter((l) => l.kind === "resistance");
    const sup = levels.filter((l) => l.kind === "support");
    expect(res.length).toBeGreaterThan(0);
    expect(sup.length).toBeGreaterThan(0);
    expect(Math.max(...res.map((l) => l.price))).toBeGreaterThan(109);
    expect(Math.min(...sup.map((l) => l.price))).toBeLessThan(101);
    expect(res[0]!.touches).toBeGreaterThan(2);
  });
});

describe("candlestick patterns", () => {
  it("detects a hammer after a decline", () => {
    const closes = [110, 108, 106, 104, 102, 100];
    const bars = barsFromCloses(closes, 0.1);
    bars.push({ time: "2024-02-01", open: 99.4, high: 100.1, low: 96, close: 100, volume: 1 });
    const hits = detectPatterns(bars, 3);
    expect(hits[0]?.name).toBe("Hammer");
    expect(hits[0]?.bias).toBe("bullish");
  });
  it("detects a bearish engulfing after an advance", () => {
    const bars = barsFromCloses([100, 101, 102, 103, 104, 105], 0.1);
    bars.push({ time: "2024-02-01", open: 105, high: 106.1, low: 104.9, close: 106, volume: 1 });
    bars.push({ time: "2024-02-02", open: 106.3, high: 106.4, low: 104.4, close: 104.5, volume: 1 });
    const hits = detectPatterns(bars, 2);
    expect(hits[0]?.name).toBe("Bearish Engulfing");
  });
});

describe("end to end on demo data", () => {
  it("produces a complete result for every range", () => {
    const bars = generateBars("AAPL", new Date("2020-01-01"), new Date("2026-10-28"));
    for (const range of ["3M", "6M", "1Y", "2Y", "5Y"] as const) {
      const r = analyze("AAPL", bars, range, "demo");
      expect(r.bars.length).toBe(RANGE_BARS[range]);
      // 200-day average must cover the whole visible window thanks to warm-up history.
      expect(r.overlays.sma200.length).toBe(r.bars.length);
      expect(r.signals.length).toBeGreaterThanOrEqual(6);
      expect(r.trend.score).toBeGreaterThanOrEqual(-100);
      expect(r.trend.score).toBeLessThanOrEqual(100);
      expect(r.levels.every((l) => (l.kind === "support") === l.price <= r.lastBar.close)).toBe(true);
    }
  });
  it("is deterministic per symbol", () => {
    const a = generateBars("MSFT", new Date("2026-01-01"), new Date("2026-03-01"));
    const b = generateBars("MSFT", new Date("2026-01-01"), new Date("2026-03-01"));
    expect(a).toEqual(b);
    expect(a.every((x) => x.high >= Math.max(x.open, x.close) && x.low <= Math.min(x.open, x.close))).toBe(true);
  });
});

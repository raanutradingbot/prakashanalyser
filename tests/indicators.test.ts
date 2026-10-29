import { describe, expect, it } from "vitest";
import { atr, bollinger, ema, macd, rsi, slopePct, sma } from "@/lib/indicators";

describe("sma", () => {
  it("averages a rolling window and pads with null", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
});

describe("ema", () => {
  it("is seeded with the SMA and then smooths", () => {
    const out = ema([1, 2, 3, 4, 5, 6], 3);
    expect(out.slice(0, 2)).toEqual([null, null]);
    expect(out[2]).toBe(2);
    expect(out[3]).toBeCloseTo(3);
    expect(out[5]).toBeCloseTo(5);
  });
});

describe("rsi (Wilder)", () => {
  // Classic dataset from Wilder / StockCharts' RSI walkthrough.
  const closes = [
    44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61,
    46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64,
  ];
  it("matches the published values", () => {
    const out = rsi(closes, 14);
    expect(out[13]).toBeNull();
    expect(out[14]).toBeCloseTo(70.46, 0);
    expect(out[15]).toBeCloseTo(66.25, 0);
    expect(out[19]).toBeCloseTo(57.92, 0);
  });
  it("is 100 for a strictly rising series and 0 for a falling one", () => {
    const up = Array.from({ length: 30 }, (_, i) => 10 + i);
    expect(rsi(up)[29]).toBe(100);
    expect(rsi([...up].reverse())[29]).toBe(0);
  });
});

describe("macd", () => {
  it("is positive in a steady uptrend and histogram aligns", () => {
    const up = Array.from({ length: 80 }, (_, i) => 100 + i * 0.5);
    const { macd: line, signal, histogram } = macd(up);
    expect(line[79]!).toBeGreaterThan(0);
    expect(signal[79]).not.toBeNull();
    expect(histogram[79]!).toBeCloseTo(line[79]! - signal[79]!);
    expect(signal.findIndex((v) => v != null)).toBe(25 + 8);
  });
});

describe("bollinger", () => {
  it("collapses to the price for a flat series", () => {
    const flat = new Array(25).fill(50);
    const b = bollinger(flat);
    expect(b.upper[24]).toBe(50);
    expect(b.lower[24]).toBe(50);
  });
});

describe("atr", () => {
  it("equals the constant range when bars don't gap", () => {
    const n = 30;
    const closes = new Array(n).fill(100);
    const highs = new Array(n).fill(101);
    const lows = new Array(n).fill(99);
    expect(atr(highs, lows, closes, 14)[29]).toBeCloseTo(2);
  });
});

describe("slopePct", () => {
  it("reports percent-of-mean slope per bar", () => {
    const s = slopePct([99, 100, 101], 3)!;
    expect(s).toBeCloseTo(1);
  });
});

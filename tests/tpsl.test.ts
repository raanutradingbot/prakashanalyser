import { describe, expect, it } from "vitest";
import { findLatestTpSlSignal } from "@/lib/tpsl";
import type { Bar } from "@/lib/types";

function bar(i: number, close: number, high = close, low = close): Bar {
  return { time: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`, open: close, high, low, close, volume: 1_000_000 };
}

describe("findLatestTpSlSignal", () => {
  it("returns null without enough history", () => {
    const bars = Array.from({ length: 10 }, (_, i) => bar(i, 100));
    expect(findLatestTpSlSignal(bars)).toBeNull();
  });

  it("returns null with no EMA(5)/EMA(13) crossover (flat series)", () => {
    const bars = Array.from({ length: 40 }, (_, i) => bar(i, 100));
    expect(findLatestTpSlSignal(bars)).toBeNull();
  });

  it("detects a buy signal on a sharp reversal up, with TP/SL in the correct RR proportions", () => {
    // Decline first so EMA(5) sits below EMA(13), then a sharp rise forces a crossover.
    const decline = Array.from({ length: 20 }, (_, i) => bar(i, 100 - i, 100 - i + 0.5, 100 - i - 0.5));
    const rise = Array.from({ length: 15 }, (_, i) => bar(20 + i, 80 + i * 6, 80 + i * 6 + 0.5, 80 + i * 6 - 0.5));
    const bars = [...decline, ...rise];

    const sig = findLatestTpSlSignal(bars)!;
    expect(sig).not.toBeNull();
    expect(sig.direction).toBe("buy");
    expect(sig.sl).toBeLessThan(sig.entry);
    expect(sig.tp1).toBeGreaterThan(sig.entry);
    expect(sig.tp1).toBeLessThan(sig.tp2);
    expect(sig.tp2).toBeLessThan(sig.tp3);

    const risk = sig.entry - sig.sl;
    expect(sig.tp1).toBeCloseTo(sig.entry + risk * 1, 1);
    expect(sig.tp2).toBeCloseTo(sig.entry + risk * 2, 1);
    expect(sig.tp3).toBeCloseTo(sig.entry + risk * 3, 1);
  });

  it("detects a sell signal symmetrically on a sharp reversal down", () => {
    const rally = Array.from({ length: 20 }, (_, i) => bar(i, 100 + i, 100 + i + 0.5, 100 + i - 0.5));
    const drop = Array.from({ length: 15 }, (_, i) => bar(20 + i, 120 - i * 6, 120 - i * 6 + 0.5, 120 - i * 6 - 0.5));
    const bars = [...rally, ...drop];

    const sig = findLatestTpSlSignal(bars)!;
    expect(sig.direction).toBe("sell");
    expect(sig.sl).toBeGreaterThan(sig.entry);
    expect(sig.tp1).toBeLessThan(sig.entry);
    const risk = sig.sl - sig.entry;
    expect(sig.tp1).toBeCloseTo(sig.entry - risk * 1, 1);
    expect(sig.tp3).toBeCloseTo(sig.entry - risk * 3, 1);
  });

  it("marks TP/SL levels hit once subsequent bars reach them", () => {
    const decline = Array.from({ length: 20 }, (_, i) => bar(i, 100 - i, 100 - i + 0.5, 100 - i - 0.5));
    // Only enough rise bars to reach the crossover itself -- nothing after it yet.
    const rise = Array.from({ length: 4 }, (_, i) => bar(20 + i, 80 + i * 6, 80 + i * 6 + 0.5, 80 + i * 6 - 0.5));
    const base = [...decline, ...rise];
    const baseSig = findLatestTpSlSignal(base)!;
    expect(baseSig.time).toBe(base[base.length - 1]!.time); // signal lands on the last bar we built

    // No bars after the signal bar yet -- nothing hit.
    expect(baseSig.tp1Hit).toBe(false);
    expect(baseSig.slHit).toBe(false);

    // Add a bar whose high spikes well past TP3, none below SL.
    const withSpike = [...base, bar(base.length, base[base.length - 1]!.close, baseSig.tp3 + 10, baseSig.entry)];
    const spiked = findLatestTpSlSignal(withSpike)!;
    expect(spiked.tp1Hit).toBe(true);
    expect(spiked.tp2Hit).toBe(true);
    expect(spiked.tp3Hit).toBe(true);
    expect(spiked.slHit).toBe(false);

    // Add a bar whose low dives below SL instead.
    const withDrop = [...base, bar(base.length, base[base.length - 1]!.close, baseSig.entry, baseSig.sl - 10)];
    const dropped = findLatestTpSlSignal(withDrop)!;
    expect(dropped.slHit).toBe(true);
    expect(dropped.tp1Hit).toBe(false);
  });
});

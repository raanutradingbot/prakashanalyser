import { describe, expect, it } from "vitest";
import { normalizeSymbol, parseRange } from "@/lib/symbols";

describe("normalizeSymbol", () => {
  it("accepts US tickers and share classes", () => {
    expect(normalizeSymbol("aapl")).toBe("AAPL");
    expect(normalizeSymbol(" $spy ")).toBe("SPY");
    expect(normalizeSymbol("brk-b")).toBe("BRK.B");
    expect(normalizeSymbol("BF/B")).toBe("BF.B");
  });
  it("rejects non-US and malformed symbols", () => {
    expect(normalizeSymbol("RELIANCE.NS")).toBeNull();
    expect(normalizeSymbol("VOD.L")).toBeNull();
    expect(normalizeSymbol("TOOLONG")).toBeNull();
    expect(normalizeSymbol("12AB")).toBeNull();
    expect(normalizeSymbol("")).toBeNull();
  });
});

describe("parseRange", () => {
  it("defaults to 1Y", () => {
    expect(parseRange("6m")).toBe("6M");
    expect(parseRange("10Y")).toBe("1Y");
    expect(parseRange(null)).toBe("1Y");
  });
});

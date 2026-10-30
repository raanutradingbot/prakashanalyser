import { describe, expect, it } from "vitest";
import { normalizeSymbol, parseRange, toDailyRange } from "@/lib/symbols";

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
  it("accepts the intraday ranges", () => {
    expect(parseRange("1d")).toBe("1D");
    expect(parseRange("1w")).toBe("1W");
  });
});

describe("toDailyRange", () => {
  it("passes daily ranges through unchanged", () => {
    expect(toDailyRange("3M")).toBe("3M");
    expect(toDailyRange("5Y")).toBe("5Y");
  });
  it("clamps intraday ranges to a daily default", () => {
    expect(toDailyRange("1D")).toBe("3M");
    expect(toDailyRange("1W")).toBe("3M");
  });
});

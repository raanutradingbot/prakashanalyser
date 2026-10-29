import { afterEach, describe, expect, it, vi } from "vitest";
import { alpacaProvider } from "@/lib/data/alpaca";
import { polygonProvider } from "@/lib/data/polygon";
import { DataProviderError, SymbolNotFoundError } from "@/lib/data/provider";

const from = new Date("2026-01-01");
const to = new Date("2026-01-10");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("alpaca provider", () => {
  it("maps bars to Eastern trading dates and follows pagination", async () => {
    vi.stubEnv("ALPACA_API_KEY_ID", "k");
    vi.stubEnv("ALPACA_API_SECRET_KEY", "s");
    const pages = [
      { bars: [{ t: "2026-01-02T05:00:00Z", o: 1, h: 2, l: 0.5, c: 1.5, v: 100 }], next_page_token: "p2" },
      { bars: [{ t: "2026-01-05T05:00:00Z", o: 1.5, h: 2.5, l: 1, c: 2, v: 200 }], next_page_token: null },
    ];
    const fetchMock = vi.fn(async (url: URL, init: RequestInit) => {
      expect((init.headers as Record<string, string>)["APCA-API-KEY-ID"]).toBe("k");
      expect(url.searchParams.get("adjustment")).toBe("all");
      return new Response(JSON.stringify(pages.shift()), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const bars = await alpacaProvider().getDailyBars("AAPL", from, to);
    expect(bars.map((b) => b.time)).toEqual(["2026-01-02", "2026-01-05"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1]![0] as URL).searchParams.get("page_token")).toBe("p2");
  });

  it("reports an unknown symbol", async () => {
    vi.stubEnv("ALPACA_API_KEY_ID", "k");
    vi.stubEnv("ALPACA_API_SECRET_KEY", "s");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ bars: null }), { status: 200 })));
    await expect(alpacaProvider().getDailyBars("ZZZZ", from, to)).rejects.toBeInstanceOf(SymbolNotFoundError);
  });

  it("turns network failures into a friendly error", async () => {
    vi.stubEnv("ALPACA_API_KEY_ID", "k");
    vi.stubEnv("ALPACA_API_SECRET_KEY", "s");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await expect(alpacaProvider().getDailyBars("AAPL", from, to)).rejects.toBeInstanceOf(DataProviderError);
  });
});

describe("polygon provider", () => {
  it("maps aggregates", async () => {
    vi.stubEnv("POLYGON_API_KEY", "pk");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL) => {
        expect(url.pathname).toBe("/v2/aggs/ticker/SPY/range/1/day/2026-01-01/2026-01-10");
        return new Response(JSON.stringify({ results: [{ t: Date.UTC(2026, 0, 2, 5), o: 1, h: 2, l: 0.5, c: 1.5, v: 10 }] }));
      }),
    );
    const bars = await polygonProvider().getDailyBars("SPY", from, to);
    expect(bars).toEqual([{ time: "2026-01-02", open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }]);
  });

  it("maps rate limiting to 429", async () => {
    vi.stubEnv("POLYGON_API_KEY", "pk");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 429 })));
    await expect(polygonProvider().getDailyBars("SPY", from, to)).rejects.toMatchObject({ status: 429 });
  });
});

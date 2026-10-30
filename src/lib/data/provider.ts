import type { Bar, NewsItem, SymbolHit } from "../types";

export type IntradayTimeframe = "15Min" | "1Hour";

export interface MarketDataProvider {
  id: string;
  label: string;
  /** Split- and dividend-adjusted daily bars, oldest first, between `from` and `to` inclusive. */
  getDailyBars(symbol: string, from: Date, to: Date): Promise<Bar[]>;
  /** Most recent headlines for a ticker, newest first. Optional — not every provider offers news. */
  getNews?(symbol: string, limit: number): Promise<NewsItem[]>;
  /** Ticker/company-name search for the search box. Falls back to a static list if omitted. */
  searchSymbols?(query: string, limit: number): Promise<SymbolHit[]>;
  /** Sub-daily bars for the 1D/1W chart views. `Bar.time` is a full ISO instant here, not a date. */
  getIntradayBars?(symbol: string, timeframe: IntradayTimeframe, from: Date, to: Date): Promise<Bar[]>;
}

export class DataProviderError extends Error {
  constructor(
    message: string,
    public status: number = 502,
  ) {
    super(message);
  }
}

export class SymbolNotFoundError extends DataProviderError {
  constructor(symbol: string) {
    super(`No US market data found for "${symbol}". Check the ticker and try again.`, 404);
  }
}

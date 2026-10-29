import { alpacaProvider } from "./alpaca";
import { demoProvider } from "./demo";
import { polygonProvider } from "./polygon";
import type { MarketDataProvider } from "./provider";

let cached: MarketDataProvider | null = null;

/** Picks the provider from DATA_PROVIDER (alpaca | polygon | demo). Defaults to demo. */
export function getProvider(): MarketDataProvider {
  if (cached) return cached;
  const id = (process.env.DATA_PROVIDER || "demo").toLowerCase();
  switch (id) {
    case "alpaca":
      cached = alpacaProvider();
      break;
    case "polygon":
    case "massive":
      cached = polygonProvider();
      break;
    default:
      cached = demoProvider;
  }
  return cached;
}

export * from "./provider";

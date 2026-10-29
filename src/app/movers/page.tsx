import { Suspense } from "react";
import type { Metadata } from "next";
import { getVolatilityMovers } from "@/lib/screener";
import { MoversTable } from "@/components/Screener";

// Without this, Next.js's build step can execute this page's data fetching
// once during `next build` (inside the Docker build stage, where
// .env.local isn't present and DATA_PROVIDER silently falls back to
// "demo") and bake the result into the image as if it were real — this is
// exactly what caused believable-looking but wrong prices (confirmed:
// matched the demo provider's synthetic values almost exactly) to show up
// in production despite DATA_PROVIDER=alpaca being set correctly at
// container runtime. The home page already had this and never showed the
// bug; this page didn't, and did.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Volatility movers",
  description: "US stocks with technical setups historically associated with large daily moves, split by trend direction.",
};

export default async function MoversPage() {
  return (
    <div className="wrap">
      <section className="movers-hero">
        <h1>Volatility movers</h1>
        <p className="lede">
          Stocks from the S&amp;P 500 and Nasdaq-100 currently showing a 14-day Average True Range (ATR) of
          5% or more of price — a measure of how wide their typical daily range has actually been recently, split
          by trend direction.
        </p>
        <p className="disclaimer-callout">
          <strong>This is not a prediction.</strong> A high ATR% means a stock has <em>historically</em> moved this
          much on a typical day — it does not mean today will be one of those days. No technical or fundamental
          model can reliably forecast that a specific stock will move a specific amount on a specific day. Use this
          as a starting point for your own research, not a signal to act on.
        </p>
      </section>

      <Suspense fallback={<p className="empty">Scanning for high-volatility setups… this can take a few seconds on a cold cache.</p>}>
        <MoversSections />
      </Suspense>
    </div>
  );
}

async function MoversSections() {
  const { bullish, bearish, atrThresholdPct } = await getVolatilityMovers(50);
  return (
    <>
      <section className="section" aria-labelledby="bull-h">
        <h2 id="bull-h">Bullish volatility setups</h2>
        <p className="screener-note">
          Uptrend + ATR ≥ {atrThresholdPct}% of price — upside breakout watch, not a buy signal.
        </p>
        <MoversTable hits={bullish} bias="bullish" />
      </section>

      <section className="section" aria-labelledby="bear-h">
        <h2 id="bear-h">Bearish volatility setups</h2>
        <p className="screener-note">
          Downtrend + ATR ≥ {atrThresholdPct}% of price — downside breakdown watch, not a sell or short signal.
        </p>
        <MoversTable hits={bearish} bias="bearish" />
      </section>
    </>
  );
}

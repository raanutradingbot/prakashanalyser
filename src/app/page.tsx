import Link from "next/link";
import { Suspense } from "react";
import { TickerSearch } from "@/components/TickerSearch";
import { ScoreRuler, formatDate } from "@/components/ResultParts";
import { ScreenerTable } from "@/components/Screener";
import { POPULAR } from "@/lib/symbols";
import { getAnalysis } from "@/lib/service";
import { getTopUptrends } from "@/lib/screener";
import type { TrendSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const sample = await getAnalysis("SPY", "1Y").catch(() => null);

  return (
    <div className="wrap">
      <section className="home-hero">
        <div>
          <h1>Read the trend on any US stock.</h1>
          <p className="lede">
            Type a ticker and see whether it&apos;s trending up, down or sideways, how strong the move is, where
            buyers and sellers have stepped in before, and the reasons behind every reading.
          </p>
          <TickerSearch autoFocus />
          <nav className="quick" aria-label="Popular tickers and tools">
            <Link href="/movers" className="quick-movers">
              Movers
            </Link>
            {POPULAR.map((p) => (
              <Link key={p.symbol} href={`/analyze/${p.symbol}`} title={p.name}>
                {p.symbol}
                <span>{p.name}</span>
              </Link>
            ))}
          </nav>
        </div>

        {sample && (
          <figure className="home-figure">
            <Link href="/analyze/SPY" style={{ textDecoration: "none" }}>
              <p style={{ margin: "0 0 4px", fontWeight: 600 }}>S&amp;P 500 (SPY) right now</p>
              <p
                className={`chg ${sample.trend.direction === "uptrend" ? "up" : sample.trend.direction === "downtrend" ? "down" : ""}`}
                style={{ margin: "0 0 40px", fontSize: 30, fontWeight: 700, fontStretch: "80%", lineHeight: 1.05 }}
              >
                {verdictLabel(sample.trend)}
              </p>
            </Link>
            <ScoreRuler trend={sample.trend} />
            <figcaption>Trend score from −100 to +100, as of the {formatDate(sample.lastBar.time)} close.</figcaption>
          </figure>
        )}
      </section>

      <section className="section" aria-labelledby="up-h">
        <div className="chart-head">
          <h2 id="up-h" style={{ margin: 0 }}>
            Stocks in an uptrend
          </h2>
          <p className="screener-note">
            Scanned from the S&amp;P 500 and Nasdaq-100 (plus popular ETFs) &mdash; not the whole market.
          </p>
        </div>
        <Suspense fallback={<p className="empty">Scanning for uptrends&hellip; this can take a few seconds on a cold cache.</p>}>
          <UptrendSection />
        </Suspense>
      </section>

      <section className="home-how" aria-label="What you get">
        <div>
          <h2>The trend, scored</h2>
          <p>
            Moving averages, momentum and swing structure each cast a vote. You get one score and the plain-English
            reasons that produced it.
          </p>
        </div>
        <div>
          <h2>The levels that matter</h2>
          <p>
            Support and resistance come from prices where the stock has repeatedly turned, ranked by how often and
            how recently.
          </p>
        </div>
        <div>
          <h2>Patterns, explained</h2>
          <p>
            Hammers, engulfing candles and star reversals from the last 20 sessions are marked on the chart with
            what each one usually signals.
          </p>
        </div>
      </section>
    </div>
  );
}

async function UptrendSection() {
  const hits = await getTopUptrends(100);
  return <ScreenerTable hits={hits} />;
}

function verdictLabel(t: TrendSummary) {
  if (t.direction === "sideways") return "Moving sideways";
  return `${t.strength[0]!.toUpperCase()}${t.strength.slice(1)} ${t.direction}`;
}

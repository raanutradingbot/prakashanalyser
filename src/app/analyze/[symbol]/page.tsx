import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getAnalysis, getIntradayChart } from "@/lib/service";
import { normalizeSymbol, parseRange, toDailyRange } from "@/lib/symbols";
import { isIntradayRange, RANGES, type AnalysisResult, type DailyRange, type IntradayRange, type Range } from "@/lib/types";
import { DataProviderError } from "@/lib/data";
import { AnalysisError } from "@/lib/analyze";
import { aiEnabled } from "@/lib/ai";
import { PriceChart } from "@/components/PriceChart";
import {
  LevelLadder,
  NewsList,
  PatternList,
  Reasons,
  ScoreRuler,
  SignalsTable,
  formatDate,
} from "@/components/ResultParts";

// Defense-in-depth: see the comment in src/app/movers/page.tsx for why this
// matters. This route has no generateStaticParams so Next.js likely never
// had a param value to pre-render with anyway (never observed this bug
// here), but there's no reason to leave it ambiguous.
export const dynamic = "force-dynamic";

type Params = Promise<{ symbol: string }>;
type Search = Promise<{ range?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { symbol } = await params;
  const s = normalizeSymbol(decodeURIComponent(symbol)) ?? symbol.toUpperCase();
  return { title: `${s} trend analysis` };
}

export default async function AnalyzePage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { symbol: raw } = await params;
  const { range: rawRange } = await searchParams;
  const symbol = normalizeSymbol(decodeURIComponent(raw));
  const range = parseRange(rawRange);
  const intraday = isIntradayRange(range);

  if (!symbol) {
    return (
      <Problem title={`"${decodeURIComponent(raw)}" isn't a US ticker`}>
        PrakashAnalyser covers stocks and ETFs listed on US exchanges. Try a symbol like AAPL, SPY or BRK.B.
      </Problem>
    );
  }

  // The trend verdict, signals and levels always run on daily data — even
  // when the chart itself is zoomed into 1D/1W — so they don't flip-flop
  // based on which chart resolution happens to be selected.
  let r: AnalysisResult;
  try {
    r = await getAnalysis(symbol, toDailyRange(range));
  } catch (err) {
    if (err instanceof DataProviderError || err instanceof AnalysisError) {
      return <Problem title={`Can't analyze ${symbol} right now`}>{err.message}</Problem>;
    }
    throw err;
  }

  const up = r.change.abs >= 0;
  return (
    <div className="wrap">
      <section className="quote" aria-label="Latest price">
        <span className="sym">{r.symbol}</span>
        <span className="px">{r.lastBar.close.toLocaleString("en-US", { style: "currency", currency: "USD" })}</span>
        <span className={`chg ${up ? "up" : "down"}`}>
          {up ? "+" : ""}
          {r.change.abs.toFixed(2)} ({up ? "+" : ""}
          {r.change.pct.toFixed(2)}%) on the day
        </span>
        <span className={`chg ${r.periodChangePct >= 0 ? "up" : "down"}`}>
          {r.periodChangePct >= 0 ? "+" : ""}
          {r.periodChangePct.toFixed(1)}% over {rangeLabel(r.range)}
        </span>
        <span className="asof">
          Daily close of {formatDate(r.lastBar.time)}, {r.provider}
        </span>
      </section>

      <section className="verdict" aria-labelledby="verdict-h">
        <div>
          <h1 id="verdict-h" className={r.trend.direction}>
            {r.trend.headline}
          </h1>
          <ScoreRuler trend={r.trend} />
        </div>
        <Reasons trend={r.trend} />
      </section>

      <section className="section" aria-labelledby="chart-h">
        <div className="chart-head">
          <h2 id="chart-h" style={{ margin: 0 }}>
            Price chart
          </h2>
          <nav className="ranges" aria-label="Chart range">
            {RANGES.map((x) => (
              <Link key={x} href={`/analyze/${r.symbol}?range=${x}`} aria-current={x === range ? "page" : undefined} scroll={false}>
                {x}
              </Link>
            ))}
          </nav>
          {!intraday && (
            <div className="legend" aria-hidden="true">
              <span>
                <i style={{ background: "var(--ma20)" }} />
                20-day
              </span>
              <span>
                <i style={{ background: "var(--ma50)" }} />
                50-day
              </span>
              <span>
                <i style={{ background: "var(--ma200)" }} />
                200-day
              </span>
              <span>
                <i className="dash" />
                Support and resistance
              </span>
              <span>
                <i style={{ background: "var(--up)" }} />
                TP/SL signal
              </span>
            </div>
          )}
        </div>
        <Suspense
          key={range}
          fallback={
            <div className="chart-box chart-box-loading">
              <p className="empty">Loading chart…</p>
            </div>
          }
        >
          <ChartSection symbol={r.symbol} range={range} daily={r} />
        </Suspense>
        <p className="chart-note">
          {intraday
            ? intradayNote(range)
            : "Lower pane: RSI (14) with 70 and 30 marked. Arrows mark candlestick patterns. Entry/SL/TP1-3 lines show the latest 5/13-EMA crossover signal, sized off ATR(14) — not a recommendation, just where that rule-based signal and its risk levels currently sit."}
        </p>
      </section>

      <div className="details section">
        <section aria-labelledby="sig-h">
          <h2 id="sig-h">Indicators</h2>
          <SignalsTable signals={r.signals} />
        </section>
        <div>
          <section aria-labelledby="lv-h" style={{ marginBottom: 36 }}>
            <h2 id="lv-h">Key levels</h2>
            <LevelLadder levels={r.levels} price={r.lastBar.close} />
          </section>
          <section aria-labelledby="pt-h">
            <h2 id="pt-h">Recent candlestick patterns</h2>
            <PatternList patterns={r.patterns} />
          </section>
        </div>
      </div>

      <section className="section" aria-labelledby="news-h">
        <h2 id="news-h">Latest news</h2>
        <Suspense fallback={<p className="empty">Loading recent headlines…</p>}>
          <NewsSection symbol={r.symbol} range={r.range} />
        </Suspense>
      </section>

      {aiEnabled() && (
        <section className="section ai" aria-labelledby="ai-h">
          <h2 id="ai-h">In plain English</h2>
          <Suspense fallback={<p className="empty">Writing a summary of this chart…</p>}>
            <AiSummary symbol={r.symbol} range={r.range} />
          </Suspense>
        </section>
      )}
    </div>
  );
}

async function ChartSection({ symbol, range, daily }: { symbol: string; range: Range; daily: AnalysisResult }) {
  if (!isIntradayRange(range)) {
    return (
      <PriceChart
        bars={daily.bars}
        overlays={daily.overlays}
        rsi={daily.rsi}
        levels={daily.levels}
        patterns={daily.patterns}
        tpSl={daily.tpSl}
      />
    );
  }
  try {
    const bars = await getIntradayChart(symbol, range);
    if (bars.length === 0) {
      return (
        <div className="chart-box chart-box-loading">
          <p className="empty">No intraday data available right now.</p>
        </div>
      );
    }
    return <PriceChart bars={bars} intraday />;
  } catch (err) {
    const message = err instanceof DataProviderError ? err.message : "Couldn't load the intraday chart right now.";
    return (
      <div className="chart-box chart-box-loading">
        <p className="empty">{message}</p>
      </div>
    );
  }
}

async function NewsSection({ symbol, range }: { symbol: string; range: DailyRange }) {
  const r = await getAnalysis(symbol, range, { news: true });
  return <NewsList items={r.news ?? []} />;
}

async function AiSummary({ symbol, range }: { symbol: string; range: DailyRange }) {
  const r = await getAnalysis(symbol, range, { ai: true });
  if (!r.aiSummary) return <p className="empty">A written summary isn&apos;t available right now.</p>;
  return (
    <>
      {r.aiSummary.split(/\n\s*\n/).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      <p className="attribution">Written by AI from the readings above. It can make mistakes.</p>
    </>
  );
}

function Problem({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="wrap problem">
      <h1>{title}</h1>
      <p>{children}</p>
      <p>
        <Link href="/">Search another ticker</Link>
      </p>
    </div>
  );
}

function rangeLabel(r: DailyRange) {
  return { "3M": "3 months", "6M": "6 months", "1Y": "1 year", "2Y": "2 years", "5Y": "5 years" }[r];
}

function intradayNote(r: IntradayRange) {
  return {
    "1D": "15-minute bars for the most recent trading session.",
    "15m": "15-minute bars for the last 2 trading sessions.",
    "30m": "30-minute bars for the last week.",
    "1H": "Hourly bars for the last month.",
    "4H": "4-hour bars for the last 3 months.",
  }[r];
}

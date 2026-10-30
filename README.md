# PrakashAnalyser (US)

Ticker-based technical trend analysis for **US-listed stocks and ETFs**. Type a symbol (AAPL, SPY, BRK.B…) and get:

- **A trend verdict** — uptrend / downtrend / sideways, a −100…+100 score, and the plain-English reasons behind it
- **An interactive chart** — daily candles, 20/50/200-day averages, volume, RSI, support and resistance lines, pattern markers
- **Indicator readings** — moving-average stack, RSI(14), MACD(12,26,9), Bollinger %B, ATR volatility, relative volume, 52-week position
- **Key levels** — support and resistance found from repeated swing turns, ranked by touches and recency
- **Candlestick patterns** — doji, hammer / hanging man, shooting star / inverted hammer, engulfing, morning / evening star, three soldiers / crows
- **Optional AI summary** — a short plain-English write-up of the readings (Claude), off unless you add a key

The analysis engine is plain TypeScript with no external TA library, and is unit-tested.

## Quick start

```bash
npm install
cp .env.example .env.local      # works as-is with synthetic demo data
npm run dev                      # http://localhost:3000
```

Run the checks:

```bash
npm test          # 24 unit tests (indicators, trend, levels, patterns, providers, symbols)
npm run typecheck
npm run build
```

## Market data

Set `DATA_PROVIDER` in `.env.local`:

| Provider | `DATA_PROVIDER` | Keys | Notes |
|---|---|---|---|
| Demo | `demo` | none | Deterministic synthetic prices per ticker, for development and demos. **Not real data.** |
| Alpaca | `alpaca` | `ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY` | Free tier uses the IEX feed (prices fine, volume is IEX-only). Set `ALPACA_FEED=sip` on a paid plan for full consolidated volume. |
| Polygon.io / Massive | `polygon` | `POLYGON_API_KEY` | Split/dividend adjusted daily aggregates. Override `POLYGON_BASE_URL` if you use the newer Massive host. |

All providers return split- and dividend-adjusted daily bars. The app fetches ~6.5 years once per ticker (cached for `CACHE_TTL_SECONDS`) so every chart range shares one request and the 200-day average is valid from the first visible bar.

**Chart ranges, 15 minutes to 5 years:** the price chart has nine range buttons — `15m`, `30m`, `1H`, `4H` (intraday) and `3M`/`6M`/`1Y`/`2Y`/`5Y` (daily bars). Only the chart switches resolution on the intraday ranges; the trend verdict, signals, and support/resistance levels stay anchored to the daily dataset (clamped to 3M) so they don't change just because you zoomed the chart in. Each intraday range pulls a sensible amount of history for its bar size (15m → last 2 sessions, 30m → last week, 1H → last month, 4H → last 3 months) via a separate `getIntradayBars` provider method (`MarketDataProvider` in `src/lib/data/provider.ts`), cached briefly via `INTRADAY_CACHE_TTL_SECONDS` (default 60s) since intraday data goes stale fast. Demo mode generates synthetic intraday bars that glide between each day's real (demo) open and close, so the intraday view lines up with whatever the daily chart already shows.

**Latest news:** each ticker page shows the 5 most recent headlines (cached for `NEWS_CACHE_TTL_SECONDS`, default 900s). Alpaca and Polygon both return real headlines with a link to the source; demo mode shows clearly-labeled synthetic placeholders instead of real news.

**"Stocks in an uptrend" (home page):** scans the list in `src/lib/data/symbolIndex.ts` — S&P 500 + Nasdaq-100 constituents plus a handful of popular ETFs, ~550 tickers (not the whole market, since analyzing thousands of tickers isn't practical on a free data plan) — and lists the ones currently in a confirmed uptrend, strongest first. Computed with limited concurrency and cached for `SCAN_CACHE_TTL_SECONDS` (default 1800s). See `src/lib/screener.ts`. Regenerate the list with `node scripts/build-symbol-index.mjs` if index membership drifts (constituents change a few times a year).

**Volatility movers (`/movers`):** same list, filtered to stocks whose 14-day ATR is at or above `MOVERS_ATR_THRESHOLD_PCT` (default 5%) of price, split into "bullish" and "bearish" by trend direction. This is a measure of *historical* typical daily range, explicitly not a prediction that any stock will move that much today — the page copy says so directly. See `getVolatilityMovers` in `src/lib/screener.ts`. If you ever turn this into something that reads more like a trading signal (specific price targets, "buy/short now" language), talk to a securities lawyer first — see the compliance section below.

**TP/SL signal on the daily chart:** a port of the open-source TradingView indicator ["KN - Smart TP SL Signals"](https://www.tradingview.com/script/Xmti9o4w-KN-Smart-TP-SL-Signals/) by phamhaihoclt — a 5/13-EMA crossover signal with ATR(14)-based risk levels (SL at 1.5×ATR from entry, TP1/TP2/TP3 at 1×/2×/3× that same risk distance). The chart shows the most recent crossover's Entry/SL/TP1-3 as horizontal lines, with a ✓ once price has since touched a level. Computed on daily bars only (not shown on the 15m/30m/1H/4H intraday views). See `findLatestTpSlSignal` in `src/lib/tpsl.ts`. Like every other reading here, it's a fixed rule applied to history, not a recommendation.

**Licensing:** before launching publicly, confirm your data plan allows *redistribution / display to end users*. Most free and personal tiers do not, and exchanges charge separate display fees for real-time data. End-of-day data is usually the cheapest path.

Adding another provider: implement `MarketDataProvider` (`src/lib/data/provider.ts`) and register it in `src/lib/data/index.ts`.

## AI summary (optional)

Set `ANTHROPIC_API_KEY` (and optionally `AI_MODEL`, default `claude-sonnet-5-5`). The result page then streams a short summary under the indicators. The prompt (`src/lib/ai.ts`) restricts the model to the computed readings and forbids buy/sell/hold language. Summaries are cached for 6 hours per ticker, range and trading day.

## API

```
GET /api/analyze?symbol=AAPL&range=1Y&ai=1
```

`range` is one of `3M 6M 1Y 2Y 5Y` (default `1Y`) — this endpoint always returns the daily trend analysis; passing an intraday range here just falls back to `3M`. Returns the full `AnalysisResult` JSON (see `src/lib/types.ts`). Rate-limited per IP (`RATE_LIMIT_PER_MINUTE`, default 30). Errors are `{ "error": "..." }` with 400 (bad ticker), 404 (unknown ticker), 429, 503 or 500.

```
GET /api/intraday?symbol=AAPL&range=15m
```

`range` is one of `15m 30m 1H 4H`. Returns `{ symbol, range, bars }` — just the sub-daily OHLCV bars, no trend analysis. 501 if the configured provider doesn't support intraday bars.

## How the trend score works

`src/lib/trend.ts` — each factor votes between −1 and +1 and is weighted:

| Factor | Weight |
|---|---|
| Price vs 50-day average (scaled by distance in ATRs) | 1.5 |
| Price vs 200-day average (scaled by distance in ATRs) | 1.5 |
| 50-day vs 200-day (golden / death cross state) | 1.0 |
| 20-day vs 50-day | 0.5 |
| Slope of the 50-day average | 1.5 |
| Regression slope of price, last 50 sessions | 1.0 |
| MACD line and histogram | 1.0 |
| RSI(14) distance from 50 | 1.0 |
| Swing structure (higher highs/lows vs lower) | 1.0 |

Score = weighted average × 100. ≥ +25 is an uptrend, ≤ −25 a downtrend, otherwise sideways; |score| ≥ 40 is moderate and ≥ 65 strong. Tune weights and thresholds there; the tests in `tests/analysis.test.ts` will tell you if a change breaks the basic cases.

## Project layout

```
src/
  app/
    page.tsx                  home: search, popular tickers, live SPY reading
    analyze/[symbol]/page.tsx result page (the "show result" screen)
    api/analyze/route.ts      JSON API
  components/                 chart (lightweight-charts), ruler, ladder, tables
  lib/
    indicators.ts             SMA, EMA, RSI, MACD, Bollinger, ATR, slope
    levels.ts                 swing pivots → support/resistance clusters
    patterns.ts               candlestick pattern detectors
    trend.ts                  trend scoring and reasons
    analyze.ts                orchestrates everything into an AnalysisResult
    service.ts                fetch + cache + analyze + AI (server only)
    data/                     alpaca, polygon, demo providers
tests/                        vitest unit tests
```

## Deploy

**Vercel:** import the repo, add the env vars, deploy. No other setup.

**Docker:**

```bash
docker build -t prakash-analyser .
docker run -p 3000:3000 --env-file .env.local prakash-analyser
```

The in-memory cache and rate limiter are per instance. When you run more than one instance, move them to Redis (e.g. Upstash) — both live in `src/lib/cache.ts`.

**Important for any new page that fetches live data:** add `export const dynamic = "force-dynamic";`. The Dockerfile deliberately doesn't copy `.env.local` into the build image (see `.dockerignore`), so during `docker build`, `DATA_PROVIDER` is unset and silently falls back to `"demo"`. Without the dynamic export, Next.js can execute a plain (no dynamic URL param) page once during the build step and bake that demo-data result into the image — which then gets served at runtime regardless of the correct real env vars at container start. This actually happened in production for `/movers` (missing the export) while `/` (which has it) never showed the issue; root-caused by comparing values against the demo provider's deterministic synthetic output, which matched almost exactly. All current pages/routes have the export now; keep it on anything new.

**Oracle Cloud (Always Free):** full step-by-step runbook in `DEPLOY_ORACLE.md` — account signup, VM creation, firewall rules, a free domain, and `docker-compose.yml` + `Caddyfile` (included) for automatic HTTPS.

## Desktop app (Windows / macOS / Linux)

An Electron wrapper around the same production build used for Docker/Oracle — see `DESKTOP.md`. Quick start: `npm run desktop:install && npm run desktop`.

## Android app (Play Store)

A Trusted Web Activity (real native app, not a fake wrapper) built with Google's Bubblewrap tool, using the PWA manifest/service worker already set up in `src/app/manifest.ts` and `public/sw.js`. Needs the site live on HTTPS first — full steps in `ANDROID.md`.

## US compliance notes (not legal advice)

The app is built to stay in "general, impersonal market information" territory, which is how most US charting and screening tools avoid registering as investment advisers:

- No buy/sell/hold recommendations, price targets or personalized suggestions — readings are "bullish / bearish / neutral" descriptions of indicators.
- The same output for everyone; nothing is tailored to a user's finances.
- A clear disclaimer on every page (footer in `src/app/layout.tsx`).
- The AI prompt forbids recommendation language.

If you add personalized features (portfolio-based suggestions, alerts that say "buy now", paid signal groups, auto-trading), talk to a US securities lawyer first about SEC/state investment-adviser rules and FINRA communications rules. Also review your data vendor's display terms, add a privacy policy and terms of service, and handle accessibility (the UI targets WCAG AA: keyboard focus, contrast, reduced motion).

## Suggested next steps

- Ticker autocomplete with company names (Alpaca `/v2/assets` or Polygon `/v3/reference/tickers`)
- Accounts, watchlists and email alerts when a trend flips
- Weekly bars for 2Y/5Y, intraday timeframes on paid data
- Sector and index comparison (relative strength vs SPY)
- Stripe subscriptions for premium features

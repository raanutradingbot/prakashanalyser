"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { AnalysisResult } from "@/lib/types";

type Props = Pick<AnalysisResult, "bars"> &
  Partial<Pick<AnalysisResult, "overlays" | "rsi" | "levels" | "patterns" | "tpSl">> & {
    /** True for the 1D/1W intraday views: shows time-of-day on the x-axis, skips the
     *  daily-only indicators (SMA overlays, RSI, support/resistance, patterns). */
    intraday?: boolean;
  };

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function alpha(hex: string, a: number) {
  const m = hex.replace("#", "");
  if (m.length !== 6) return hex;
  const n = parseInt(m, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Converts a Bar's `time` (either "YYYY-MM-DD" or a full ISO instant) to the
 *  numeric UTCTimestamp lightweight-charts needs for intraday time-of-day display. */
function toChartTime(s: string): Time {
  const iso = s.includes("T") ? s : `${s}T00:00:00Z`;
  return Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp;
}

/**
 * Candles + volume, and — for daily ranges only — 20/50/200-day averages,
 * support/resistance lines, pattern markers, and an RSI pane underneath.
 */
export function PriceChart({ bars, overlays, rsi, levels, patterns, tpSl, intraday = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let chart: IChartApi | null = null;

    const build = () => {
      chart?.remove();
      const c = {
        surface: cssVar("--surface"),
        ink2: cssVar("--ink-2"),
        ink3: cssVar("--ink-3"),
        rule: cssVar("--rule-soft"),
        up: cssVar("--up"),
        down: cssVar("--down"),
        ma20: cssVar("--ma20"),
        ma50: cssVar("--ma50"),
        ma200: cssVar("--ma200"),
        flat: cssVar("--flat"),
      };

      chart = createChart(el, {
        autoSize: true,
        layout: {
          background: { type: ColorType.Solid, color: c.surface },
          textColor: c.ink2,
          fontFamily: getComputedStyle(document.body).fontFamily,
          fontSize: 12,
          panes: { separatorColor: c.rule, separatorHoverColor: c.rule },
        },
        grid: { vertLines: { color: c.rule }, horzLines: { color: c.rule } },
        rightPriceScale: { borderColor: c.rule },
        timeScale: {
          borderColor: c.rule,
          rightOffset: 4,
          timeVisible: intraday,
          secondsVisible: false,
        },
        crosshair: { mode: CrosshairMode.Normal },
      });

      const candles = chart.addSeries(CandlestickSeries, {
        upColor: c.up,
        downColor: c.down,
        borderUpColor: c.up,
        borderDownColor: c.down,
        wickUpColor: c.up,
        wickDownColor: c.down,
        priceLineVisible: false,
      });
      candles.setData(bars.map((b) => ({ time: toChartTime(b.time), open: b.open, high: b.high, low: b.low, close: b.close })));

      const volume = chart.addSeries(HistogramSeries, {
        priceScaleId: "vol",
        priceFormat: { type: "volume" },
        lastValueVisible: false,
        priceLineVisible: false,
      });
      volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      volume.setData(
        bars.map((b) => ({
          time: toChartTime(b.time),
          value: b.volume,
          color: alpha(b.close >= b.open ? c.up : c.down, 0.25),
        })),
      );

      if (overlays) {
        const line = (data: typeof overlays.sma20, color: string, width: 1 | 2) => {
          if (data.length === 0) return;
          const s = chart!.addSeries(LineSeries, {
            color,
            lineWidth: width,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          s.setData(data.map((p) => ({ time: toChartTime(p.time), value: p.value })));
        };
        line(overlays.sma20, c.ma20, 1);
        line(overlays.sma50, c.ma50, 2);
        line(overlays.sma200, c.ma200, 2);
      }

      for (const l of levels ?? []) {
        candles.createPriceLine({
          price: l.price,
          color: alpha(l.kind === "support" ? c.up : c.down, 0.8),
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: l.kind === "support" ? "Support" : "Resistance",
        });
      }

      const shownTimes = new Set(bars.map((b) => b.time));
      const markers: SeriesMarker<Time>[] = [];
      if (patterns && patterns.length > 0) {
        markers.push(
          ...patterns
            .filter((p) => shownTimes.has(p.time))
            .map((p): SeriesMarker<Time> => ({
              time: toChartTime(p.time),
              position: p.bias === "bearish" ? "aboveBar" : "belowBar",
              shape: p.bias === "bullish" ? "arrowUp" : p.bias === "bearish" ? "arrowDown" : "circle",
              color: p.bias === "bullish" ? c.up : p.bias === "bearish" ? c.down : c.flat,
            })),
        );
      }
      if (tpSl && shownTimes.has(tpSl.time)) {
        markers.push({
          time: toChartTime(tpSl.time),
          position: tpSl.direction === "buy" ? "belowBar" : "aboveBar",
          shape: tpSl.direction === "buy" ? "arrowUp" : "arrowDown",
          color: tpSl.direction === "buy" ? c.up : c.down,
          text: tpSl.direction === "buy" ? "BUY" : "SELL",
        });
      }
      if (markers.length > 0) {
        createSeriesMarkers(
          candles,
          markers.sort((a, b) => (a.time < b.time ? -1 : 1)),
        );
      }

      if (tpSl) {
        const tpLine = (price: number, title: string, hit: boolean, width: 1 | 2, dashed: boolean) => {
          candles.createPriceLine({
            price,
            color: alpha(c.up, hit ? 0.95 : 0.6),
            lineWidth: width,
            lineStyle: hit ? LineStyle.Solid : dashed ? LineStyle.Dashed : LineStyle.Solid,
            axisLabelVisible: true,
            title: hit ? `${title} ✓` : title,
          });
        };
        candles.createPriceLine({
          price: tpSl.entry,
          color: alpha(c.ink2, 0.9),
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: "Entry",
        });
        candles.createPriceLine({
          price: tpSl.sl,
          color: alpha(c.down, tpSl.slHit ? 0.9 : 0.7),
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: tpSl.slHit ? "SL ✕" : "SL",
        });
        tpLine(tpSl.tp1, "TP1", tpSl.tp1Hit, 1, true);
        tpLine(tpSl.tp2, "TP2", tpSl.tp2Hit, 1, true);
        tpLine(tpSl.tp3, "TP3", tpSl.tp3Hit, 2, false);
      }

      if (rsi && rsi.length > 0) {
        const rsiSeries = chart.addSeries(
          LineSeries,
          { color: c.ink2, lineWidth: 1, priceLineVisible: false, lastValueVisible: true },
          1,
        );
        rsiSeries.setData(rsi.map((p) => ({ time: toChartTime(p.time), value: p.value })));
        for (const [v, col] of [
          [70, c.down],
          [30, c.up],
        ] as const) {
          rsiSeries.createPriceLine({ price: v, color: alpha(col, 0.6), lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" });
        }
        chart.panes()[0]?.setStretchFactor(4);
        chart.panes()[1]?.setStretchFactor(1);
      }
      chart.timeScale().fitContent();
    };

    build();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", build);
    return () => {
      mq.removeEventListener("change", build);
      chart?.remove();
    };
  }, [bars, overlays, rsi, levels, patterns, tpSl, intraday]);

  return (
    <div
      ref={ref}
      className="chart-box"
      role="img"
      aria-label={
        intraday
          ? "Intraday candlestick chart with volume"
          : "Daily candlestick chart with 20, 50 and 200-day moving averages, support and resistance lines, volume, and RSI"
      }
    />
  );
}

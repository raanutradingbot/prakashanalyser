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
} from "lightweight-charts";
import type { AnalysisResult } from "@/lib/types";

type Props = Pick<AnalysisResult, "bars" | "overlays" | "rsi" | "levels" | "patterns">;

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function alpha(hex: string, a: number) {
  const m = hex.replace("#", "");
  if (m.length !== 6) return hex;
  const n = parseInt(m, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/**
 * Candles + 20/50/200-day averages, support/resistance lines, pattern
 * markers, a volume histogram, and an RSI pane underneath.
 */
export function PriceChart({ bars, overlays, rsi, levels, patterns }: Props) {
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
        timeScale: { borderColor: c.rule, rightOffset: 4 },
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
      candles.setData(bars.map((b) => ({ time: b.time as Time, open: b.open, high: b.high, low: b.low, close: b.close })));

      const volume = chart.addSeries(HistogramSeries, {
        priceScaleId: "vol",
        priceFormat: { type: "volume" },
        lastValueVisible: false,
        priceLineVisible: false,
      });
      volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      volume.setData(
        bars.map((b) => ({
          time: b.time as Time,
          value: b.volume,
          color: alpha(b.close >= b.open ? c.up : c.down, 0.25),
        })),
      );

      const line = (data: typeof overlays.sma20, color: string, width: 1 | 2) => {
        const s = chart!.addSeries(LineSeries, {
          color,
          lineWidth: width,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        s.setData(data.map((p) => ({ time: p.time as Time, value: p.value })));
      };
      line(overlays.sma20, c.ma20, 1);
      line(overlays.sma50, c.ma50, 2);
      line(overlays.sma200, c.ma200, 2);

      for (const l of levels) {
        candles.createPriceLine({
          price: l.price,
          color: alpha(l.kind === "support" ? c.up : c.down, 0.8),
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: l.kind === "support" ? "Support" : "Resistance",
        });
      }

      const shown = new Set(bars.map((b) => b.time));
      const markers: SeriesMarker<Time>[] = patterns
        .filter((p) => shown.has(p.time))
        .map((p): SeriesMarker<Time> => ({
          time: p.time as Time,
          position: p.bias === "bearish" ? "aboveBar" : "belowBar",
          shape: p.bias === "bullish" ? "arrowUp" : p.bias === "bearish" ? "arrowDown" : "circle",
          color: p.bias === "bullish" ? c.up : p.bias === "bearish" ? c.down : c.flat,
        }))
        .sort((a, b) => (a.time < b.time ? -1 : 1));
      createSeriesMarkers(candles, markers);

      const rsiSeries = chart.addSeries(
        LineSeries,
        { color: c.ink2, lineWidth: 1, priceLineVisible: false, lastValueVisible: true },
        1,
      );
      rsiSeries.setData(rsi.map((p) => ({ time: p.time as Time, value: p.value })));
      for (const [v, col] of [
        [70, c.down],
        [30, c.up],
      ] as const) {
        rsiSeries.createPriceLine({ price: v, color: alpha(col, 0.6), lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" });
      }
      chart.panes()[0]?.setStretchFactor(4);
      chart.panes()[1]?.setStretchFactor(1);
      chart.timeScale().fitContent();
    };

    build();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", build);
    return () => {
      mq.removeEventListener("change", build);
      chart?.remove();
    };
  }, [bars, overlays, rsi, levels, patterns]);

  return (
    <div
      ref={ref}
      className="chart-box"
      role="img"
      aria-label="Daily candlestick chart with 20, 50 and 200-day moving averages, support and resistance lines, volume, and RSI"
    />
  );
}

import Anthropic from "@anthropic-ai/sdk";
import type { AnalysisResult } from "./types";

const SYSTEM = `You write short, plain-English technical analysis summaries for a US stock chart tool.
Rules:
- Use ONLY the data provided. Never invent news, earnings, fundamentals or price targets.
- Describe what the chart shows (trend, momentum, key levels, recent candle patterns) and what traders typically watch next.
- This is general educational information, not personalized advice: never tell the reader to buy, sell, or hold, and never mention position sizing.
- 3 short paragraphs, under 140 words total, no headings, no bullet points.`;

export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function writeSummary(r: Omit<AnalysisResult, "aiSummary">): Promise<string | null> {
  if (!aiEnabled()) return null;
  const client = new Anthropic({ timeout: 20_000, maxRetries: 1 });

  const facts = {
    symbol: r.symbol,
    asOf: r.lastBar.time,
    close: r.lastBar.close,
    dayChangePct: r.change.pct,
    periodChangePct: r.periodChangePct,
    range: r.range,
    trend: r.trend,
    signals: r.signals,
    levels: r.levels,
    recentPatterns: r.patterns.slice(0, 5),
    high52w: r.high52w,
    low52w: r.low52w,
  };

  try {
    const msg = await client.messages.create({
      model: process.env.AI_MODEL || "claude-sonnet-5-5",
      max_tokens: 400,
      system: SYSTEM,
      messages: [{ role: "user", content: `Chart data (JSON):\n${JSON.stringify(facts)}` }],
    });
    const text = msg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    return text || null;
  } catch (err) {
    console.error("AI summary failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

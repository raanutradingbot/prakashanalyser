import Link from "next/link";
import type { MoverHit, ScanHit } from "@/lib/screener";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function ScreenerTable({ hits }: { hits: ScanHit[] }) {
  if (hits.length === 0) {
    return <p className="empty">Nothing in our list is in a confirmed uptrend right now. Check back later.</p>;
  }
  return (
    <div className="screener-wrap">
      <table className="screener">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Symbol</th>
            <th scope="col">Price</th>
            <th scope="col">Day</th>
            <th scope="col">Trend</th>
          </tr>
        </thead>
        <tbody>
          {hits.map((h, i) => (
            <tr key={h.symbol}>
              <td className="rank">{i + 1}</td>
              <td className="sym">
                <Link href={`/analyze/${h.symbol}`}>
                  <span className="t">{h.symbol}</span>
                  <span className="n">{h.name}</span>
                </Link>
              </td>
              <td className="px">{usd(h.close)}</td>
              <td className={`chg ${h.changePct >= 0 ? "up" : "down"}`}>
                {h.changePct >= 0 ? "+" : ""}
                {h.changePct.toFixed(2)}%
              </td>
              <td>
                <span className="pill bullish">
                  {h.strength[0]!.toUpperCase() + h.strength.slice(1)} (+{h.score})
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MoversTable({ hits, bias }: { hits: MoverHit[]; bias: "bullish" | "bearish" }) {
  if (hits.length === 0) {
    return <p className="empty">Nothing in our list clears the volatility bar on the {bias} side right now.</p>;
  }
  return (
    <div className="screener-wrap">
      <table className="screener movers">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Symbol</th>
            <th scope="col">Price</th>
            <th scope="col">Day</th>
            <th scope="col">ATR%</th>
            <th scope="col">5%+ days (20d)</th>
            <th scope="col">Trend</th>
          </tr>
        </thead>
        <tbody>
          {hits.map((h, i) => (
            <tr key={h.symbol}>
              <td className="rank">{i + 1}</td>
              <td className="sym">
                <Link href={`/analyze/${h.symbol}`}>
                  <span className="t">{h.symbol}</span>
                  <span className="n">{h.name}</span>
                </Link>
              </td>
              <td className="px">{usd(h.close)}</td>
              <td className={`chg ${h.changePct >= 0 ? "up" : "down"}`}>
                {h.changePct >= 0 ? "+" : ""}
                {h.changePct.toFixed(2)}%
              </td>
              <td className="px">{h.atrPct.toFixed(1)}%</td>
              <td className="px">{h.bigMoveDays}</td>
              <td>
                <span className={`pill ${bias}`}>
                  {h.strength[0]!.toUpperCase() + h.strength.slice(1)} {bias === "bullish" ? "+" : ""}
                  {h.trendScore}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

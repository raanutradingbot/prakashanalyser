import type { Level, NewsItem, PatternHit, Signal, TrendSummary } from "@/lib/types";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** Bearish ← → Bullish ruler with a needle at the trend score. */
export function ScoreRuler({ trend }: { trend: TrendSummary }) {
  const left = ((trend.score + 100) / 200) * 100;
  const label = trend.score > 0 ? `+${trend.score}` : `${trend.score}`;
  return (
    <div className="ruler" role="meter" aria-valuemin={-100} aria-valuemax={100} aria-valuenow={trend.score} aria-label="Trend score">
      <div className="ruler-track">
        <div className="bar" />
        {[0, 25, 37.5, 50, 62.5, 75, 100].map((t) => (
          <div key={t} className="tick" style={{ left: `${t}%` }} />
        ))}
        <div className="needle" style={{ left: `${left}%` }}>
          <span>{label}</span>
        </div>
      </div>
      <div className="ruler-labels">
        <span>Bearish</span>
        <span>Sideways</span>
        <span>Bullish</span>
      </div>
    </div>
  );
}

export function Reasons({ trend }: { trend: TrendSummary }) {
  const sign = trend.direction === "sideways" ? 0 : Math.sign(trend.score);
  return (
    <div className="reasons">
      <h2>Why this reading</h2>
      <ul>
        {trend.reasons.map((r) => (
          <li key={r.text} className={sign !== 0 && Math.abs(r.vote) >= 0.15 && Math.sign(r.vote) === sign ? `agree ${trend.direction}` : ""}>
            {r.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SignalsTable({ signals }: { signals: Signal[] }) {
  return (
    <table className="signals">
      <thead>
        <tr>
          <th scope="col">Indicator</th>
          <th scope="col">Value</th>
          <th scope="col">Reading</th>
          <th scope="col">What it means</th>
        </tr>
      </thead>
      <tbody>
        {signals.map((s) => (
          <tr key={s.name}>
            <td className="name">{s.name}</td>
            <td className="value">{s.value}</td>
            <td>
              <span className={`pill ${s.bias}`}>{s.bias[0]!.toUpperCase() + s.bias.slice(1)}</span>
            </td>
            <td className="note">{s.note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Vertical price ladder: resistance above, the latest close, support below. */
export function LevelLadder({ levels, price }: { levels: Level[]; price: number }) {
  const sorted = [...levels].sort((a, b) => b.price - a.price);
  const above = sorted.filter((l) => l.kind === "resistance");
  const below = sorted.filter((l) => l.kind === "support");
  if (levels.length === 0) return <p className="empty">Not enough swing points in this range to mark levels.</p>;
  const row = (l: Level) => (
    <li key={`${l.kind}-${l.price}`} className={l.kind}>
      <span className="lp">{usd(l.price)}</span>
      <span className="lk">
        {l.kind === "support" ? "Support" : "Resistance"}, {l.touches} {l.touches === 1 ? "touch" : "touches"}
        <Strength value={l.strength} />
      </span>
      <span className="ld">
        {l.distancePct > 0 ? "+" : ""}
        {l.distancePct.toFixed(1)}%
      </span>
    </li>
  );
  return (
    <ol className="ladder" aria-label="Key price levels from highest to lowest">
      {above.map(row)}
      <li className="current">
        <span className="lp">{usd(price)}</span>
        <span className="lk">Last close</span>
      </li>
      {below.map(row)}
    </ol>
  );
}

function Strength({ value }: { value: number }) {
  const on = Math.max(1, Math.round(value * 4));
  return (
    <span className="strength" aria-label={`Strength ${on} of 4`}>
      {[1, 2, 3, 4].map((i) => (
        <b key={i} className={i <= on ? "on" : ""} />
      ))}
    </span>
  );
}

export function PatternList({ patterns }: { patterns: PatternHit[] }) {
  if (patterns.length === 0) return <p className="empty">No classic candlestick patterns in the last 20 sessions.</p>;
  return (
    <ul className="patterns">
      {patterns.slice(0, 6).map((p) => (
        <li key={`${p.time}-${p.name}`}>
          <div className="ph">
            <span className="pn">{p.name}</span>
            <span className={`pill ${p.bias}`}>{p.bias[0]!.toUpperCase() + p.bias.slice(1)}</span>
            <time dateTime={p.time}>{formatDate(p.time)}</time>
          </div>
          <p>{p.description}</p>
        </li>
      ))}
    </ul>
  );
}

export function NewsList({ items }: { items: NewsItem[] }) {
  if (items.length === 0) return <p className="empty">No recent news found for this ticker.</p>;
  return (
    <ul className="news">
      {items.slice(0, 5).map((n) => (
        <li key={n.url + n.publishedAt}>
          <a href={n.url} target="_blank" rel="noopener noreferrer nofollow">
            {n.headline}
          </a>
          <div className="nf">
            <span className="src">{n.source}</span>
            <time dateTime={n.publishedAt}>{formatRelative(n.publishedAt)}</time>
          </div>
        </li>
      ))}
    </ul>
  );
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.round(diffMs / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso.slice(0, 10));
}

export function formatDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

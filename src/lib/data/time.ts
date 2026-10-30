const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The US/Eastern calendar date (YYYY-MM-DD) for a timestamp — the trading date of a daily bar. */
export function toEasternDate(d: Date): string {
  return fmt.format(d);
}

/** ISO instant (e.g. "2026-10-29T14:30:00.000Z") for an intraday bar — unlike
 *  toEasternDate, this preserves time-of-day, needed for sub-daily charting. */
export function toInstant(d: Date): string {
  return d.toISOString();
}

/**
 * Converts an US/Eastern wall-clock time (e.g. 9:30 on a given trading date)
 * to the correct UTC instant, accounting for EST/EDT — needed to place
 * synthetic intraday bars at the right market-hours timestamps regardless of
 * the time of year. `dateStr` is "YYYY-MM-DD".
 */
export function easternWallClockToUtc(dateStr: string, hour: number, minute: number): Date {
  const probe = new Date(`${dateStr}T12:00:00Z`); // noon UTC is always still the same ET calendar day
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
  }).formatToParts(probe);
  const offsetName = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-5";
  const offsetHours = Number(offsetName.replace("GMT", "")) || -5;
  const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, hour - offsetHours, minute));
}

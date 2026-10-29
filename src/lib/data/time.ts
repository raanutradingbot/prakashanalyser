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

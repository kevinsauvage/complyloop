/**
 * Date/time formatters. `formatDateTimeWithZone` appends the UTC offset for
 * compliance artifacts (reports, exports) so a printed instant is
 * unambiguous. Interactive UI renders `<FormattedDateTime>`, which wraps a
 * `time` with `suppressHydrationWarning` (server UTC vs browser TZ would
 * otherwise throw React hydration error #418).
 */

function formatDateTimeValue(date: Date): string {
  return date.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Zone-qualified timestamp for compliance artifacts (reports, exports).
 * Appends the local UTC offset (e.g. "+02:00") so a printed instant is
 * unambiguous across readers. The offset is computed
 * from `getTimezoneOffset` rather than `Intl` `timeZoneName` so it works on
 * every Node/ICU build.
 */
export function formatDateTimeWithZone(iso: string): string {
  const date = new Date(iso);
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hours = String(Math.floor(abs / 60)).padStart(2, "0");
  const minutes = String(abs % 60).padStart(2, "0");
  return `${formatDateTimeValue(date)} (UTC${sign}${hours}:${minutes})`;
}

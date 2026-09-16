/**
 * Date/time formatters. `formatDateTime` is local-time-only for interactive
 * UI — never render it as a bare text node in SSR: server (UTC) and browser
 * (viewer TZ) strings differ and throw React hydration error #418. Use
 * `<FormattedDateTime>` instead, which wraps it in a `time` with
 * `suppressHydrationWarning`. `formatDateTimeWithZone` appends the UTC offset
 * for compliance artifacts (reports, exports) so a printed instant is
 * unambiguous.
 */

export function formatDateTime(iso: string): string {
  return formatDateTimeValue(new Date(iso));
}

function formatDateTimeValue(date: Date): string {
  return date.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Zone-qualified timestamp for compliance artifacts (reports, exports).
 * Appends the local UTC offset (e.g. "+02:00") so a printed instant is
 * unambiguous across readers — unlike {@link formatDateTime}, which is
 * local-time-only and safe for interactive UI only. The offset is computed
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

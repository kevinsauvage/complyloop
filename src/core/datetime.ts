/**
 * Date/time formatters. `formatDateTimeWithZone` appends the UTC offset for
 * compliance artifacts (reports, exports) so a printed instant is
 * unambiguous. Interactive UI renders `<FormattedDateTime>`, which prints UTC on the
 * server/hydration pass and the viewer's zone afterwards.
 */

function formatDateTimeValue(date: Date, timeZone?: "UTC"): string {
  return date.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  });
}

/**
 * Zone-qualified timestamp for compliance artifacts (reports, exports).
 * Appends the local UTC offset (e.g. "+02:00") so a printed instant is
 * unambiguous across readers. The offset is computed
 * from `getTimezoneOffset` rather than `Intl` `timeZoneName` so it works on
 * every Node/ICU build.
 */
export function formatDateTimeWithZone(iso: string, timeZone?: "UTC"): string {
  const date = new Date(iso);
  const offsetMinutes = timeZone === "UTC" ? 0 : -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hours = String(Math.floor(abs / 60)).padStart(2, "0");
  const minutes = String(abs % 60).padStart(2, "0");
  return `${formatDateTimeValue(date, timeZone)} (UTC${sign}${hours}:${minutes})`;
}

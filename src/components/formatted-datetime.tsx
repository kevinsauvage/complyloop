import { formatDateTimeWithZone } from "@/core/datetime";
import { cn } from "@/lib/utils";

/**
 * Zone-qualified timestamp for viewer UI (server component — no client
 * boundary, no hydration mismatch).
 *
 * The previous client-side `toLocaleString` rendered UTC on hard loads
 * (Vercel server TZ, kept by `suppressHydrationWarning`) and local time on
 * client navigations — inconsistent instants in a compliance product.
 * `formatDateTimeWithZone` appends the renderer offset (e.g. "+02:00"), so
 * the printed instant is unambiguous everywhere, matching reports/exports.
 */
export function FormattedDateTime({
  iso,
  className,
}: {
  iso: string;
  className?: string;
}) {
  return (
    <time dateTime={iso} className={cn(className)}>
      {formatDateTimeWithZone(iso)}
    </time>
  );
}

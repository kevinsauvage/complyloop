"use client";

import { formatDateTime } from "@/core/datetime";
import { cn } from "@/lib/utils";

/**
 * Hydration-safe locale timestamp for interactive UI.
 *
 * `formatDateTime` is local-time-only (`toLocaleString`), so the server
 * (UTC on Vercel) and the browser (viewer TZ) render different strings.
 * Rendering it as a bare text node throws React hydration error #418 and
 * forces a client-side remount of the whole tree. The `time` element below
 * carries `suppressHydrationWarning` so React keeps the client string
 * silently — the standard Next.js pattern for dates.
 *
 * Use this instead of calling `formatDateTime` directly in JSX. Compliance
 * artifacts (reports, exports) keep using `formatDateTimeWithZone`.
 */
export function FormattedDateTime({
  iso,
  className,
}: {
  iso: string;
  className?: string;
}) {
  return (
    <time
      dateTime={iso}
      suppressHydrationWarning
      className={cn(className)}
    >
      {formatDateTime(iso)}
    </time>
  );
}

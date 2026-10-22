"use client";

import { useSyncExternalStore } from "react";

import { formatDateTimeWithZone } from "@/core/datetime";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};

/**
 * Zone-qualified timestamp for viewer UI. Every instance renders the same
 * way no matter where its parent runs: the server pass and the hydration
 * pass print UTC, then the browser re-renders in the viewer's zone. Before
 * this, server-rendered stamps (Vercel = UTC) and stamps inside client
 * components (browser zone) sat side by side on the dashboard and disagreed
 * by the UTC offset. The printed offset (e.g. "UTC+02:00") keeps the instant
 * unambiguous in both passes.
 */
export function FormattedDateTime({
  iso,
  className,
}: {
  iso: string;
  className?: string;
}) {
  const label = useSyncExternalStore(
    subscribe,
    () => formatDateTimeWithZone(iso),
    () => formatDateTimeWithZone(iso, "UTC"),
  );
  return (
    <time dateTime={iso} className={cn(className)}>
      {label}
    </time>
  );
}

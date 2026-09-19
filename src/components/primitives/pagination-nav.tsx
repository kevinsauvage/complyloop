import Link from "next/link";

import { Button } from "@/components/ui/button";

export function PaginationNav({
  page,
  totalPages,
  total,
  basePath,
  label = "Pagination",
  query,
  pageSize,
}: {
  page: number;
  totalPages: number;
  total: number;
  basePath: string;
  label?: string;
  /** Extra query params preserved on page links (e.g. `{ tab: "resolved" }`). */
  query?: Record<string, string>;
  /** Items per page — used for the "Showing A–B of N" label. */
  pageSize?: number;
}) {
  const hrefFor = (target: number) => {
    const params: Record<string, string> = { ...(query ?? {}) };
    if (target > 1) params.page = String(target);
    else delete params.page;
    const qs = new URLSearchParams(params).toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  // Numbered window: first … current±1 … last (max 5 numbers + ellipses).
  const windowPages: (number | "gap-start" | "gap-end")[] = [];
  if (totalPages > 1) {
    const candidates = new Set<number>([
      1,
      totalPages,
      page - 1,
      page,
      page + 1,
    ]);
    const sorted = [...candidates]
      .filter((n) => n >= 1 && n <= totalPages)
      .sort((a, b) => a - b);
    let previous = 0;
    for (const n of sorted) {
      if (previous > 0 && n - previous > 1) {
        windowPages.push(previous === 1 ? "gap-start" : "gap-end");
      }
      windowPages.push(n);
      previous = n;
    }
  }

  const rangeLabel =
    pageSize && total > 0
      ? `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`
      : total === 1
        ? "1 item"
        : `${total} items`;

  // Always render the nav slot so single-page lists don't shift layout when
  // filters change the result count.
  if (totalPages <= 1) {
    return (
      <nav
        aria-label={label}
        className="invisible flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"
        aria-hidden
      >
        <p>
          Page {page} of {totalPages}
          <span> · {rangeLabel}</span>
        </p>
      </nav>
    );
  }

  return (
    <nav
      aria-label={label}
      className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"
    >
      <p>
        Page {page} of {totalPages}
        <span> · {rangeLabel}</span>
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {page > 1 ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={hrefFor(page - 1)}>Previous</Link>
          </Button>
        ) : null}
        {windowPages.map((entry) =>
          entry === "gap-start" || entry === "gap-end" ? (
            <span key={entry} aria-hidden className="px-1">
              …
            </span>
          ) : entry === page ? (
            <span
              key={entry}
              aria-current="page"
              className="rounded-md bg-accent px-2.5 py-1 font-medium text-foreground tabular-nums"
            >
              {entry}
            </span>
          ) : (
            <Button key={entry} variant="ghost" size="sm" asChild>
              <Link href={hrefFor(entry)} aria-label={`Page ${entry}`}>
                {entry}
              </Link>
            </Button>
          ),
        )}
        {page < totalPages ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={hrefFor(page + 1)}>Next</Link>
          </Button>
        ) : null}
      </div>
    </nav>
  );
}

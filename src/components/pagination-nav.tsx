import Link from "next/link";
import { Button } from "@/components/ui/button";
import { buildHref } from "@/core/query";

export function PaginationNav({
  page,
  totalPages,
  total,
  basePath,
  label = "Pagination",
  query,
}: {
  page: number;
  totalPages: number;
  total: number;
  basePath: string;
  label?: string;
  /** Extra query params preserved on page links (e.g. `{ tab: "resolved" }`). */
  query?: Record<string, string>;
}) {
  if (totalPages <= 1) return null;

  const hrefFor = (target: number) => {
    const params: Record<string, string> = { ...(query ?? {}) };
    if (target > 1) params.page = String(target);
    else delete params.page;
    return buildHref(basePath, params);
  };

  return (
    <nav
      aria-label={label}
      className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"
    >
      <p>
        Page {page} of {totalPages}
        <span> · {total} total</span>
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={hrefFor(page - 1)}>Previous</Link>
          </Button>
        ) : null}
        {page < totalPages ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={hrefFor(page + 1)}>Next</Link>
          </Button>
        ) : null}
      </div>
    </nav>
  );
}

import Link from "next/link";
import { Button } from "@/components/ui/button";

export function PaginationNav({
  page,
  totalPages,
  total,
  basePath,
  label = "Pagination",
}: {
  page: number;
  totalPages: number;
  total: number;
  basePath: string;
  label?: string;
}) {
  if (totalPages <= 1) return null;

  const hrefFor = (target: number) =>
    target <= 1 ? basePath : `${basePath}?page=${target}`;

  return (
    <nav
      aria-label={label}
      className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"
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

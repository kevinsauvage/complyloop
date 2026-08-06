import Link from "next/link";

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
      className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-600"
    >
      <p>
        Page {page} of {totalPages}
        <span className="text-zinc-500"> · {total} total</span>
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link
            href={hrefFor(page - 1)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Previous
          </Link>
        ) : null}
        {page < totalPages ? (
          <Link
            href={hrefFor(page + 1)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Next
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

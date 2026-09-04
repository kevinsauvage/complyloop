import { firstParam } from "./query-param";

export const DEFAULT_PAGE_SIZE = 25;

export function parsePageParam(
  raw: string | string[] | undefined,
): number {
  const value = firstParam(raw);
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

export interface PageSlice<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

function pageMeta(
  page: number,
  total: number,
  pageSize: number,
): Omit<PageSlice<unknown>, "items"> {
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const currentPage = Math.min(Math.max(1, page), totalPages);
  return {
    page: currentPage,
    pageSize,
    total,
    totalPages,
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages,
  };
}

export function paginateSlice<T>(
  items: readonly T[],
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): PageSlice<T> {
  const meta = pageMeta(page, items.length, pageSize);
  const start = (meta.page - 1) * pageSize;
  return {
    ...meta,
    items: items.slice(start, start + pageSize),
  };
}

/** Build a page slice when items were already fetched for `page` (SQL LIMIT/OFFSET). */
export function pageSliceFromQuery<T>(
  items: readonly T[],
  page: number,
  total: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): PageSlice<T> {
  return {
    ...pageMeta(page, total, pageSize),
    items: [...items],
  };
}

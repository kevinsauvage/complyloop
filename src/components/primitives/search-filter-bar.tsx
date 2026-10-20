"use client";

import { ChevronDown, Search } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { filterChipClass } from "./filter-chip-list";

/** A removable active-filter chip: a link to the same view without it. */
export function ActiveFilterChip({
  href,
  clearLabel,
  children,
}: {
  href: string;
  clearLabel: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href as Route}
      aria-label={clearLabel}
      className={cn(filterChipClass(false), "rounded-full text-xs")}
    >
      {children}
      <span aria-hidden className="font-semibold">
        ×
      </span>
    </Link>
  );
}

/**
 * The one search + filter bar for list pages (findings, evidence,
 * requirements): a search field with its Search button, optional secondary
 * fields behind a native disclosure (open while any filter is active), then
 * the active-filter chips with a reset link. Plain GET form — filters live in
 * the URL and nothing auto-submits.
 */
export function SearchFilterBar({
  action,
  label,
  inputId,
  placeholder,
  defaultValue,
  hiddenFields,
  activeChips = [],
  resetHref,
  onSearchClick,
  children,
}: {
  /** Path the GET form submits to, e.g. `/evidence`. */
  action: string;
  /** Accessible name of the search form and field, e.g. "Search evidence". */
  label: string;
  inputId: string;
  placeholder: string;
  defaultValue?: string;
  /** State the form must carry across a search (current tab, kind, …). */
  hiddenFields?: Record<string, string | undefined>;
  /** Pre-built `ActiveFilterChip`s, one per applied filter. */
  activeChips?: readonly ReactNode[];
  /** Where "Reset" goes; shown only while a filter is active. */
  resetHref?: string;
  onSearchClick?: () => void;
  /** Secondary filter fields (selects, dates…), laid out in a grid. */
  children?: ReactNode;
}) {
  const activeCount = activeChips.length;
  return (
    <div className="surface-panel flex flex-col gap-3 rounded-xl p-3 sm:p-4">
      <form
        method="get"
        action={action}
        role="search"
        aria-label={label}
        className="flex flex-col gap-3"
      >
        {Object.entries(hiddenFields ?? {}).map(([name, value]) =>
          value ? (
            <input key={name} type="hidden" name={name} value={value} />
          ) : null,
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Label htmlFor={inputId} className="sr-only">
              {label}
            </Label>
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id={inputId}
              name="q"
              type="search"
              defaultValue={defaultValue ?? ""}
              placeholder={placeholder}
              maxLength={100}
              autoComplete="off"
              className="pl-8"
            />
          </div>
          <Button type="submit" size="sm" onClick={onSearchClick}>
            Search
          </Button>
        </div>
        {children ? (
          <details className="group" open={activeCount > 0}>
            <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <ChevronDown
                className="size-4 transition-transform group-open:rotate-180"
                aria-hidden
              />
              Filters
              {activeCount > 0 ? (
                <span className="rounded-full bg-signal/15 px-1.5 py-0.5 font-mono text-xs text-signal">
                  {activeCount}
                </span>
              ) : null}
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {children}
            </div>
          </details>
        ) : null}
      </form>
      {activeCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <ul className="flex flex-wrap gap-2" aria-label="Active filters">
            {activeChips.map((chip, index) => (
              <li key={index}>{chip}</li>
            ))}
          </ul>
          {resetHref ? (
            <Link
              href={resetHref as Route}
              className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Reset
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Label + control stack used for the secondary fields. */
export function FilterField({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

"use client";

import Link from "next/link";
import { type ReactNode,useState } from "react";

import type { RemediationStatus, Severity } from "@complyloop/analysis-core/contract/statuses";

import { filterChipClass } from "@/components/filter-chip-list";
import { nativeSelectClass } from "@/components/form-classes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  engineDisplay,
  remediationStatusDisplay,
  severityDisplay,
} from "@/core/display";
import type { FindingListParams } from "@/core/filter-params";
import { findingsListHref } from "@/core/filter-params";
import { cn } from "@/lib/utils";

const SEVERITIES: Severity[] = ["critical", "serious", "moderate", "minor"];

const REMEDIATION_FILTER_STATUSES: RemediationStatus[] = [
  "detected",
  "suggested",
  "approved",
  "implemented",
  "verified",
];

function markResultsForFocus() {
  try {
    sessionStorage.setItem("complyloop-focus-results", "1");
  } catch {
    // Storage unavailable (private mode, cookies blocked) — navigation still works.
  }
}

function ActiveChip({
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
      href={href}
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

export function FindingsFilterBar({
  params,
  controlLabel,
}: {
  params: FindingListParams;
  /** Human-readable control code for the active control filter, when set. */
  controlLabel?: string;
}) {
  const clearedHref = (overrides: Partial<FindingListParams>) =>
    findingsListHref({ ...params, page: 1, ...overrides });

  const chips: ReactNode[] = [];
  if (params.q) {
    chips.push(
      <ActiveChip
        key="q"
        href={clearedHref({ q: undefined })}
        clearLabel={`Clear search filter ${params.q}`}
      >
        <span className="max-w-48 truncate">“{params.q}”</span>
      </ActiveChip>,
    );
  }
  if (params.severity) {
    chips.push(
      <ActiveChip
        key="severity"
        href={clearedHref({ severity: undefined })}
        clearLabel="Clear severity filter"
      >
        Severity: {severityDisplay(params.severity).label}
      </ActiveChip>,
    );
  }
  if (params.engine) {
    chips.push(
      <ActiveChip
        key="engine"
        href={clearedHref({ engine: undefined })}
        clearLabel="Clear source filter"
      >
        Source: {engineDisplay(params.engine).label}
      </ActiveChip>,
    );
  }
  if (params.remediation) {
    chips.push(
      <ActiveChip
        key="remediation"
        href={clearedHref({ remediation: undefined })}
        clearLabel="Clear remediation filter"
      >
        Remediation: {remediationStatusDisplay(params.remediation).label}
      </ActiveChip>,
    );
  }
  if (params.control) {
    chips.push(
      <ActiveChip
        key="control"
        href={clearedHref({ control: undefined })}
        clearLabel="Clear rule filter"
      >
        Rule: {controlLabel ?? params.control}
      </ActiveChip>,
    );
  }
  if (params.cluster) {
    chips.push(
      <ActiveChip
        key="cluster"
        href={clearedHref({ cluster: undefined, tab: "open" })}
        clearLabel="Clear root cause filter"
      >
        Root cause
      </ActiveChip>,
    );
  }

  // All filters apply explicitly via Apply — selects never auto-submit, so
  // keyboard exploration never triggers a surprise navigation. On mobile the
  // fields collapse behind a disclosure with an active-filter count badge.
  const [expanded, setExpanded] = useState(chips.length > 0);

  return (
    <div className="surface-panel flex flex-col gap-3 rounded-xl p-4">
      {chips.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Active filters">
          {chips.map((chip, index) => (
            <li key={index}>{chip}</li>
          ))}
        </ul>
      ) : null}
      <form
        method="get"
        action="/findings"
        aria-label="Findings filter"
        className="flex flex-col gap-3"
      >
        {params.tab !== "open" ? (
          <input type="hidden" name="tab" value={params.tab} />
        ) : null}
        {params.cluster ? (
          <input type="hidden" name="cluster" value={params.cluster} />
        ) : null}
        {params.control ? (
          <input type="hidden" name="control" value={params.control} />
        ) : null}

        <div className="sm:hidden">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={expanded}
            aria-controls="findings-filter-fields"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Hide filters" : "Show filters"}
            {chips.length > 0 ? ` · ${chips.length}` : ""}
          </Button>
        </div>

        <div
          id="findings-filter-fields"
          className={cn(
            "gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-5",
            expanded ? "grid" : "hidden",
          )}
        >
          <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-2">
            <Label htmlFor="findings-q">Search</Label>
            <Input
              id="findings-q"
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Rule, reason, or file path"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="findings-severity">Severity</Label>
            <select
              id="findings-severity"
              name="severity"
              defaultValue={params.severity ?? ""}
              aria-label="Severity"
              className={nativeSelectClass}
            >
              <option value="">Any severity</option>
              {SEVERITIES.map((severity) => (
                <option key={severity} value={severity}>
                  {severityDisplay(severity).label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="findings-engine">Found in</Label>
            <select
              id="findings-engine"
              name="engine"
              defaultValue={params.engine ?? ""}
              aria-label="Found in"
              className={nativeSelectClass}
            >
              <option value="">Code or live page</option>
              <option value="ast">{engineDisplay("ast").label}</option>
              <option value="runtime">{engineDisplay("runtime").label}</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="findings-remediation">Remediation</Label>
            <select
              id="findings-remediation"
              name="remediation"
              defaultValue={params.remediation ?? ""}
              aria-label="Remediation"
              className={nativeSelectClass}
            >
              <option value="">Any remediation</option>
              {REMEDIATION_FILTER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {remediationStatusDisplay(status).label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" onClick={markResultsForFocus}>
            Apply filters
          </Button>
          {chips.length > 0 ? (
            <Button type="button" size="sm" variant="outline" asChild>
              <Link
                href={findingsListHref({
                  tab: params.tab,
                })}
              >
                Reset filters
              </Link>
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

"use client";

import type { ReactNode } from "react";

import type {
  RemediationStatus,
  Severity,
} from "@complyloop/analysis-core/contract/statuses";

import { nativeSelectClass } from "@/components/forms/form-classes";
import {
  ActiveFilterChip,
  FilterField,
  SearchFilterBar,
} from "@/components/primitives/search-filter-bar";
import {
  engineDisplay,
  remediationStatusDisplay,
  severityDisplay,
} from "@/core/display";
import type { FindingListParams } from "@/core/filter-params";
import { findingsListHref } from "@/core/filter-params";

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
      <ActiveFilterChip
        key="q"
        href={clearedHref({ q: undefined })}
        clearLabel={`Clear search filter ${params.q}`}
      >
        <span className="max-w-48 truncate">“{params.q}”</span>
      </ActiveFilterChip>,
    );
  }
  if (params.severity) {
    chips.push(
      <ActiveFilterChip
        key="severity"
        href={clearedHref({ severity: undefined })}
        clearLabel="Clear severity filter"
      >
        Severity: {severityDisplay(params.severity).label}
      </ActiveFilterChip>,
    );
  }
  if (params.engine) {
    chips.push(
      <ActiveFilterChip
        key="engine"
        href={clearedHref({ engine: undefined })}
        clearLabel="Clear source filter"
      >
        Source: {engineDisplay(params.engine).label}
      </ActiveFilterChip>,
    );
  }
  if (params.remediation) {
    chips.push(
      <ActiveFilterChip
        key="remediation"
        href={clearedHref({ remediation: undefined })}
        clearLabel="Clear remediation filter"
      >
        Remediation: {remediationStatusDisplay(params.remediation).label}
      </ActiveFilterChip>,
    );
  }
  if (params.control) {
    chips.push(
      <ActiveFilterChip
        key="control"
        href={clearedHref({ control: undefined })}
        clearLabel="Clear rule filter"
      >
        Rule: {controlLabel ?? params.control}
      </ActiveFilterChip>,
    );
  }

  return (
    <SearchFilterBar
      action="/findings"
      label="Search findings"
      inputId="findings-q"
      placeholder="Rule, reason, or file path"
      defaultValue={params.q}
      hiddenFields={{
        tab: params.tab !== "open" ? params.tab : undefined,
        control: params.control,
      }}
      activeChips={chips}
      resetHref={findingsListHref({ tab: params.tab })}
      onSearchClick={markResultsForFocus}
    >
      <FilterField id="findings-severity" label="Severity">
        <select
          id="findings-severity"
          name="severity"
          defaultValue={params.severity ?? ""}
          className={nativeSelectClass}
        >
          <option value="">Any severity</option>
          {SEVERITIES.map((severity) => (
            <option key={severity} value={severity}>
              {severityDisplay(severity).label}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField id="findings-engine" label="Found in">
        <select
          id="findings-engine"
          name="engine"
          defaultValue={params.engine ?? ""}
          className={nativeSelectClass}
        >
          <option value="">Code or live page</option>
          <option value="ast">{engineDisplay("ast").label}</option>
          <option value="runtime">{engineDisplay("runtime").label}</option>
        </select>
      </FilterField>
      <FilterField id="findings-remediation" label="Remediation">
        <select
          id="findings-remediation"
          name="remediation"
          defaultValue={params.remediation ?? ""}
          className={nativeSelectClass}
        >
          <option value="">Any remediation</option>
          {REMEDIATION_FILTER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {remediationStatusDisplay(status).label}
            </option>
          ))}
        </select>
      </FilterField>
    </SearchFilterBar>
  );
}

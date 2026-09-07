import Link from "next/link";
import type { FindingListParams } from "@/core/finding-list-filter";
import { findingsListHref } from "@/core/finding-list-filter";
import {
  remediationStatusDisplay,
  severityDisplay,
} from "@/core/status-display";
import type { RemediationStatus, Severity } from "@complyloop/analysis-core/contract/statuses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SEVERITIES: Severity[] = ["critical", "serious", "moderate", "minor"];

const REMEDIATION_FILTER_STATUSES: RemediationStatus[] = [
  "detected",
  "suggested",
  "approved",
  "implemented",
  "verified",
];

const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30";

export function FindingsFilterBar({
  params,
}: {
  params: FindingListParams;
}) {
  return (
    <form
      method="get"
      action="/findings"
      className="surface-panel flex flex-col gap-3 rounded-xl p-4"
      aria-label="Findings filter"
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-2">
          <Label htmlFor="findings-q">Search</Label>
          <Input
            id="findings-q"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Control, reason, or file path"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="findings-severity">Severity</Label>
          <select
            id="findings-severity"
            name="severity"
            defaultValue={params.severity ?? ""}
            className={selectClassName}
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
          <Label htmlFor="findings-engine">Engine</Label>
          <select
            id="findings-engine"
            name="engine"
            defaultValue={params.engine ?? ""}
            className={selectClassName}
          >
            <option value="">Any engine</option>
            <option value="ast">AST (source)</option>
            <option value="runtime">Runtime (browser)</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="findings-remediation">Remediation</Label>
          <select
            id="findings-remediation"
            name="remediation"
            defaultValue={params.remediation ?? ""}
            className={selectClassName}
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
        <Button type="submit" size="sm">
          Apply filters
        </Button>
        {params.q ||
        params.severity ||
        params.engine ||
        params.remediation ||
        params.cluster ? (
          <Button type="button" size="sm" variant="outline" asChild>
            <Link
              href={findingsListHref({
                tab: params.tab,
                control: params.control,
              })}
            >
              Reset filters
            </Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}

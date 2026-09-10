"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { DismissFindingFields } from "@/components/findings/dismiss-finding-fields";
import { StatefulActionForm } from "@/components/stateful-action-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { canBulkApproveRemediation } from "@/core/lifecycle";
import {
  findingDetailHref,
  type FindingListParams,
} from "@/core/filter-params";
import {
  engineDisplay,
  remediationStatusDisplay,
  severityDisplay,
} from "@/core/display";
import { formatLocationRef } from "@complyloop/analysis-core/contract/location";
import { engineFor } from "@complyloop/analysis-core/contract/finding-types";
import type { Severity } from "@complyloop/analysis-core/contract/statuses";
import { cn } from "@/lib/utils";
import {
  bulkApproveRemediationsAction,
  bulkDismissFindingsAction,
} from "@/server/actions/remediation";
import type { FindingListItem } from "./finding-list-items";

type BulkRowProps = {
  finding: FindingListItem["finding"];
  control: FindingListItem["control"];
  remediationStatus: FindingListItem["remediationStatus"];
  isSelected: boolean;
  canRemediate: boolean;
  listParams: FindingListParams;
  onToggle: (id: string) => void;
};

function severityDotClass(severity: Severity): string {
  switch (severity) {
    case "critical":
      return "bg-status-failed";
    case "serious":
      return "bg-status-failed/70";
    case "moderate":
      return "bg-status-review";
    case "minor":
      return "bg-muted-foreground/40";
  }
}

/** Scannable row: severity dot + title first, meta as muted text (no badge stack). */
function FindingsBulkRow({
  finding,
  control,
  remediationStatus,
  isSelected,
  canRemediate,
  listParams,
  onToggle,
}: BulkRowProps) {
  const checkboxId = `finding-select-${finding.id}`;
  const severityLabel = severityDisplay(finding.severity).label;
  const remediationLabel = remediationStatusDisplay(remediationStatus).label;
  const engineLabel = engineDisplay(engineFor(finding)).label;
  return (
    <li>
      <div
        className={cn(
          "group flex gap-3 rounded-xl border border-border/70 bg-card/80 p-3 shadow-none transition-[background-color,border-color,box-shadow]",
          "hover:border-signal/40 hover:bg-accent/30 hover:shadow-sm",
          isSelected && "border-signal/50 bg-signal/5",
        )}
      >
        {canRemediate ? (
          <div className="pt-1">
            <input
              id={checkboxId}
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggle(finding.id)}
              className="size-4 rounded border-input accent-signal"
              aria-label={`Select ${control.code} at ${formatLocationRef(finding.location)}`}
            />
          </div>
        ) : null}
        <Link
          href={findingDetailHref(finding.id, listParams)}
          prefetch={false}
          className="min-w-0 flex-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex items-baseline gap-2">
            <span
              aria-hidden
              className={cn(
                "size-2 shrink-0 translate-y-[-1px] rounded-full",
                severityDotClass(finding.severity),
              )}
            />
            <span className="min-w-0 flex-1 truncate text-sm font-medium group-hover:underline">
              {control.code} — {control.title}
            </span>
            <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
              {severityLabel} · {remediationLabel}
            </span>
          </span>
          <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">
            {finding.reason}
          </span>
          <span className="mt-1 block truncate font-mono text-xs text-muted-foreground">
            {formatLocationRef(finding.location)} · {engineLabel}
          </span>
        </Link>
      </div>
    </li>
  );
}

export function FindingsBulkList({
  items,
  canRemediate,
  listParams,
}: {
  items: FindingListItem[];
  canRemediate: boolean;
  listParams: FindingListParams;
}) {
  const selectAllId = useId();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [showDismiss, setShowDismiss] = useState(false);

  const allIds = items.map((item) => item.finding.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0 && !allSelected;
  const selectedCount = selected.size;
  const approvableIds = items
    .filter((item) =>
      canBulkApproveRemediation(item.finding, item.remediationStatus),
    )
    .filter((item) => selected.has(item.finding.id))
    .map((item) => item.finding.id);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      allIds.every((id) => prev.has(id)) ? new Set() : new Set(allIds),
    );
  }

  return (
    <div className="flex flex-col gap-3" aria-busy={false}>
      <p aria-live="polite" className="sr-only">
        {selectedCount === 0
          ? "No findings selected"
          : `${selectedCount} finding${selectedCount === 1 ? "" : "s"} selected`}
      </p>
      {canRemediate && items.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Bulk actions apply to this page only.
        </p>
      ) : null}
      {canRemediate && items.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <input
              ref={(el) => {
                if (el) el.indeterminate = someSelected;
              }}
              id={selectAllId}
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="size-4 rounded border-input accent-signal"
              aria-label="Select all findings on this page"
              aria-checked={someSelected ? "mixed" : allSelected}
            />
            <Label htmlFor={selectAllId} className="text-xs font-medium">
              {selectedCount > 0
                ? `${selectedCount} selected`
                : "Select findings"}
            </Label>
          </div>

          {selectedCount > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {approvableIds.length > 0 ? (
                <StatefulActionForm
                  action={bulkApproveRemediationsAction}
                  submitLabel={`Approve guidance (${approvableIds.length})`}
                  pendingLabel="Approving…"
                  size="sm"
                  variant="default"
                  confirmMessage={`Approve ${approvableIds.length} runtime guidance suggestion${approvableIds.length === 1 ? "" : "s"}?`}
                >
                  {approvableIds.map((id) => (
                    <input key={id} type="hidden" name="findingIds" value={id} />
                  ))}
                </StatefulActionForm>
              ) : (
                <span title="Only live-page findings with a generated suggestion can be approved in bulk">
                  <Button type="button" size="sm" variant="default" disabled>
                    Approve (runtime suggestions only)
                  </Button>
                </span>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowDismiss(true)}
                aria-expanded={showDismiss}
                aria-haspopup="dialog"
              >
                Dismiss…
              </Button>
              <Dialog open={showDismiss} onOpenChange={setShowDismiss}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      Dismiss {selectedCount} finding
                      {selectedCount === 1 ? "" : "s"}
                    </DialogTitle>
                    <DialogDescription>
                      Reason and note are kept as evidence.
                    </DialogDescription>
                  </DialogHeader>
                  <StatefulActionForm
                    action={bulkDismissFindingsAction}
                    submitLabel={`Dismiss ${selectedCount} finding${selectedCount === 1 ? "" : "s"}`}
                    pendingLabel="Dismissing…"
                    variant="destructive"
                    size="sm"
                    className="flex flex-col gap-3"
                    confirmMessage={`Dismiss ${selectedCount} finding${selectedCount === 1 ? "" : "s"}? Reason and note are kept as evidence.`}
                    confirmTitle="Dismiss findings"
                  >
                    {[...selected].map((id) => (
                      <input
                        key={id}
                        type="hidden"
                        name="findingIds"
                        value={id}
                      />
                    ))}
                    <DismissFindingFields
                      reasonId="bulk-dismiss-reason"
                      noteId="bulk-dismiss-note"
                    />
                  </StatefulActionForm>
                </DialogContent>
              </Dialog>
            </div>
          ) : null}
        </div>
      ) : null}

      <ul className="flex flex-col gap-2" aria-label="Findings">
        {items.map(({ finding, control, remediationStatus }) => (
          <FindingsBulkRow
            key={finding.id}
            finding={finding}
            control={control}
            remediationStatus={remediationStatus}
            isSelected={selected.has(finding.id)}
            canRemediate={canRemediate}
            listParams={listParams}
            onToggle={toggle}
          />
        ))}
      </ul>
    </div>
  );
}

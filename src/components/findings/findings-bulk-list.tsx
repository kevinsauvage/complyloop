"use client";

import Link from "next/link";
import { memo, useCallback, useId, useMemo, useState } from "react";
import {
  EngineBadge,
  RemediationStatusBadge,
  SeverityBadge,
} from "@/components/badges";
import { DismissFindingFields } from "@/components/findings/dismiss-finding-fields";
import { StatefulActionForm } from "@/components/stateful-action-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { canBulkApproveRemediation } from "@/core/finding-act";
import {
  findingDetailHref,
  type FindingListParams,
} from "@/core/finding-list-filter";
import { formatLocationRef } from "@/core/location";
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

/** Memoized row: toggling one checkbox must not re-render every row. */
const FindingsBulkRow = memo(function FindingsBulkRow({
  finding,
  control,
  remediationStatus,
  isSelected,
  canRemediate,
  listParams,
  onToggle,
}: BulkRowProps) {
  const checkboxId = `finding-select-${finding.id}`;
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
              aria-label={`Select finding ${control.code}`}
            />
          </div>
        ) : null}
        <Link
          href={findingDetailHref(finding.id, listParams)}
          className="min-w-0 flex-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={finding.severity} />
            <RemediationStatusBadge status={remediationStatus} />
            <EngineBadge engine={finding.engine ?? "ast"} />
            <span className="text-sm font-medium group-hover:underline">
              {control.code} — {control.title}
            </span>
          </span>
          <span className="mt-1.5 block text-sm text-muted-foreground">
            {finding.reason}
          </span>
          <span className="mt-1 block font-mono text-xs text-muted-foreground">
            {formatLocationRef(finding.location)}
          </span>
        </Link>
      </div>
    </li>
  );
});

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

  const allIds = useMemo(() => items.map((item) => item.finding.id), [items]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const selectedCount = selected.size;

  const approvableIds = useMemo(() => {
    return items
      .filter((item) =>
        canBulkApproveRemediation(item.finding, item.remediationStatus),
      )
      .filter((item) => selected.has(item.finding.id))
      .map((item) => item.finding.id);
  }, [items, selected]);

  // Stable identity so memoized rows skip re-render when only selection changes.
  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  function toggleAll() {
    setSelected((prev) => {
      if (allIds.every((id) => prev.has(id))) return new Set();
      return new Set(allIds);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {canRemediate && items.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Bulk actions apply to this page only.
        </p>
      ) : null}
      {canRemediate && items.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <input
              id={selectAllId}
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="size-4 rounded border-input accent-signal"
              aria-label="Select all findings on this page"
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
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowDismiss((open) => !open)}
                aria-expanded={showDismiss}
              >
                Dismiss…
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {canRemediate && showDismiss && selectedCount > 0 ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
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
              <input key={id} type="hidden" name="findingIds" value={id} />
            ))}
            <DismissFindingFields
              reasonId="bulk-dismiss-reason"
              noteId="bulk-dismiss-note"
            />
          </StatefulActionForm>
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

/** Read-only card list for resolved/dismissed tabs (no bulk actions). */
export function FindingsCardList({
  items,
  listParams,
}: {
  items: FindingListItem[];
  listParams: FindingListParams;
}) {
  return (
    <ul className="flex flex-col gap-2" aria-label="Findings">
      {items.map(({ finding, control, remediationStatus }) => (
        <li key={finding.id}>
          <Link
            href={findingDetailHref(finding.id, listParams)}
            className={cn(
              "group block rounded-xl border border-border/70 bg-card/80 p-3 shadow-none outline-none transition-[background-color,border-color,box-shadow]",
              "hover:border-signal/40 hover:bg-accent/30 hover:shadow-sm",
              "focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <span className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={finding.severity} />
              <RemediationStatusBadge status={remediationStatus} />
              <EngineBadge engine={finding.engine ?? "ast"} />
              <span className="text-sm font-medium group-hover:underline">
                {control.code} — {control.title}
              </span>
            </span>
            <span className="mt-1.5 block text-sm text-muted-foreground">
              {finding.reason}
            </span>
            <span className="mt-1 block font-mono text-xs text-muted-foreground">
              {formatLocationRef(finding.location)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import {
  EngineBadge,
  RemediationStatusBadge,
  SeverityBadge,
} from "@/components/badges";
import { StatefulActionForm } from "@/components/stateful-action-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatLocationRef } from "@/core/location";
import { cn } from "@/lib/utils";
import { bulkApproveRemediationsAction } from "@/server/actions/remediation";
import { bulkDismissFindingsAction } from "@/server/actions/remediation-dismiss";
import type { FindingListItem } from "./finding-list-items";

export type { FindingListItem } from "./finding-list-items";

export function FindingsBulkList({
  items,
  canRemediate,
}: {
  items: FindingListItem[];
  canRemediate: boolean;
}) {
  const selectAllId = useId();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [showDismiss, setShowDismiss] = useState(false);

  const allIds = useMemo(() => items.map((item) => item.finding.id), [items]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const selectedCount = selected.size;

  const approvableIds = useMemo(() => {
    return items
      .filter(
        (item) =>
          selected.has(item.finding.id) &&
          item.remediationStatus === "suggested",
      )
      .map((item) => item.finding.id);
  }, [items, selected]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      if (allIds.every((id) => prev.has(id))) return new Set();
      return new Set(allIds);
    });
  }

  return (
    <div className="flex flex-col gap-3">
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
                  submitLabel={`Approve suggested (${approvableIds.length})`}
                  pendingLabel="Approving…"
                  size="sm"
                  variant="default"
                  confirmMessage={`Approve ${approvableIds.length} suggested remediation${approvableIds.length === 1 ? "" : "s"}?`}
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
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bulk-dismiss-reason">Reason</Label>
              <select
                id="bulk-dismiss-reason"
                name="reason"
                defaultValue="false_positive"
                className="h-8 w-full max-w-md rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30"
              >
                <option value="false_positive">False positive</option>
                <option value="not_applicable">Not applicable</option>
                <option value="accepted_risk">Accepted risk</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bulk-dismiss-note">Note (kept as evidence)</Label>
              <Textarea
                id="bulk-dismiss-note"
                name="note"
                rows={2}
                className="max-w-md"
              />
            </div>
          </StatefulActionForm>
        </div>
      ) : null}

      <ul className="flex flex-col gap-2" aria-label="Findings">
        {items.map(({ finding, control, remediationStatus }) => {
          const checkboxId = `finding-select-${finding.id}`;
          const isSelected = selected.has(finding.id);
          return (
            <li key={finding.id}>
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
                      onChange={() => toggle(finding.id)}
                      className="size-4 rounded border-input accent-signal"
                      aria-label={`Select finding ${control.code}`}
                    />
                  </div>
                ) : null}
                <Link
                  href={`/findings/${finding.id}`}
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
        })}
      </ul>
    </div>
  );
}

/** Read-only card list for resolved/dismissed tabs (no bulk actions). */
export function FindingsCardList({
  items,
}: {
  items: FindingListItem[];
}) {
  return (
    <ul className="flex flex-col gap-2" aria-label="Findings">
      {items.map(({ finding, control, remediationStatus }) => (
        <li key={finding.id}>
          <Link
            href={`/findings/${finding.id}`}
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

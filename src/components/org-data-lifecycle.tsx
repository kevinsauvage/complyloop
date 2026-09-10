"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialActionState } from "@/core/action-state";
import { announceResult, useActionToast } from "@/hooks/use-action-toast";
import { deleteOrgAction, exportOrgDataAction } from "@/server/actions/org";

export function OrgDataLifecycle({
  orgId,
  orgName,
  orgSlug,
}: {
  orgId: string;
  orgName: string;
  orgSlug?: string;
}) {
  const deleteFormId = useId();
  const confirmFieldId = useId();
  const [exporting, setExporting] = useState(false);
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteOrgAction,
    initialActionState,
  );
  useActionToast(deleteState, deletePending);

  // Keep the confirm dialog open while the delete settles: success navigates
  // away (org gone), failure stays open with the inline error below.
  const wasDeletePending = useRef(false);
  useEffect(() => {
    if (deletePending) {
      wasDeletePending.current = true;
      return;
    }
    if (wasDeletePending.current && deleteState.ok) {
      setDeleteConfirmOpen(false);
    }
    wasDeletePending.current = false;
  }, [deletePending, deleteState.ok]);

  async function runExport(): Promise<void> {
    setExporting(true);
    const result = await exportOrgDataAction(orgId);
    setExporting(false);
    setExportConfirmOpen(false);
    if (result.error || !result.json) {
      announceResult(false, result.error ?? "Export failed.");
      return;
    }
    const blob = new Blob([result.json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    anchor.download = `complyloop-${orgSlug ?? orgId}-${stamp}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    announceResult(true, `Exported ${orgName} data as JSON.`);
  }

  const deleteReady = confirmText === "DELETE";

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>Data lifecycle</CardTitle>
        <CardDescription>
          Owner-only export and deletion. Review retention expectations before
          destructive actions — details are in{" "}
          <Link
            href="/legal/privacy"
            className="text-foreground underline underline-offset-2"
          >
            Privacy
          </Link>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-8">
        <section
          aria-labelledby="org-export-heading"
          className="flex flex-col gap-3 border-b border-border/60 pb-6"
        >
          <div>
            <h3
              id="org-export-heading"
              className="text-sm font-medium text-foreground"
            >
              Export organization data
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Download a machine-readable JSON snapshot of this organization,
              memberships, projects, and related compliance records you can
              access as owner.
            </p>
          </div>
          <AlertDialog
            open={exportConfirmOpen}
            onOpenChange={setExportConfirmOpen}
          >
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={exporting}
              >
                {exporting ? "Exporting…" : "Export organization JSON"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Export organization data?</AlertDialogTitle>
                <AlertDialogDescription>
                  Download a JSON file for <strong>{orgName}</strong>. The file
                  may include repository names, findings, and membership GitHub
                  usernames — store it securely.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel type="button" disabled={exporting}>
                  Cancel
                </AlertDialogCancel>
                <Button
                  type="button"
                  disabled={exporting}
                  onClick={() => {
                    void runExport();
                  }}
                >
                  {exporting ? "Exporting…" : "Download JSON"}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>

        <section
          aria-labelledby="org-delete-heading"
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
        >
          <div className="flex items-start gap-2">
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <div>
              <h3
                id="org-delete-heading"
                className="text-sm font-medium text-foreground"
              >
                Delete organization
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Permanently remove{" "}
                <strong className="text-foreground">{orgName}</strong>, its
                projects, and mutable compliance records. Evidence is kept for
                audit after disconnect or org deletion; mutable records are
                removed with the organization.
              </p>
            </div>
          </div>

          <details className="rounded-lg border border-border/60 px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-foreground">
              Advanced — show delete controls
            </summary>
            <div className="mt-3">
              <form id={deleteFormId} action={deleteAction}>
            <input type="hidden" name="orgId" value={orgId} />
            <AlertDialog
              open={deleteConfirmOpen}
              onOpenChange={(open) => {
                setDeleteConfirmOpen(open);
                if (!open) setConfirmText("");
              }}
            >
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={deletePending}
                >
                  {deletePending ? "Deleting…" : "Delete organization"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {orgName}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This cannot be undone from the product UI. Type{" "}
                    <code className="text-xs text-foreground">DELETE</code> to
                    confirm permanent deletion of projects and mutable records.
                    Evidence history is retained for audit.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="flex flex-col gap-1.5 py-2">
                  <Label htmlFor={confirmFieldId}>Confirmation</Label>
                  <Input
                    id={confirmFieldId}
                    form={deleteFormId}
                    name="confirm"
                    autoComplete="off"
                    placeholder="DELETE"
                    value={confirmText}
                    onChange={(event) => setConfirmText(event.target.value)}
                    required
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel type="button" disabled={deletePending}>
                    Cancel
                  </AlertDialogCancel>
                  <Button
                    type="submit"
                    form={deleteFormId}
                    variant="destructive"
                    disabled={!deleteReady || deletePending}
                  >
                    {deletePending ? "Deleting…" : "Delete permanently"}
                  </Button>
                </AlertDialogFooter>
                {!deleteState.ok && deleteState.message && !deletePending ? (
                  <p role="alert" className="text-sm text-destructive">
                    {deleteState.message}
                  </p>
                ) : null}
              </AlertDialogContent>
            </AlertDialog>
          </form>
            </div>
          </details>
        </section>
      </CardContent>
    </Card>
  );
}

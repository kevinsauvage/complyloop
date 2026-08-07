"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useActionToast } from "@/hooks/use-action-toast";
import {
  deleteOrgAction,
  exportOrgDataAction,
} from "@/server/actions/org";
import type { ActionMessageState } from "@/server/action-state";

// Local constant — do not import values from action-state (pulls server observability).
const initialState: ActionMessageState = { error: null, message: null };

export function OrgDataLifecycle({
  orgId,
  orgName,
}: {
  orgId: string;
  orgName: string;
}) {
  const deleteFormId = useId();
  const confirmFieldId = useId();
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteOrgAction,
    initialState,
  );
  useActionToast(deleteState);

  async function runExport(): Promise<void> {
    setExporting(true);
    setExportError(null);
    setExportMessage(null);
    const result = await exportOrgDataAction(orgId);
    setExporting(false);
    setExportConfirmOpen(false);
    if (result.error || !result.json) {
      const message = result.error ?? "Export failed.";
      setExportError(message);
      toast.error(message);
      return;
    }
    const blob = new Blob([result.json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `complyloop-org-${orgId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    const success = `Exported ${orgName} data as JSON.`;
    setExportMessage(success);
    toast.success(success);
  }

  const deleteReady = confirmText === "DELETE";

  return (
    <Card>
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
        <section aria-labelledby="org-export-heading" className="flex flex-col gap-3">
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
                  may include repository names, findings, and membership
                  GitHub usernames — store it securely.
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
          {exportError ? (
            <p role="alert" className="text-sm text-destructive">
              {exportError}
            </p>
          ) : null}
          {exportMessage ? (
            <p role="status" className="text-sm text-muted-foreground">
              {exportMessage}
            </p>
          ) : null}
        </section>

        <section
          aria-labelledby="org-delete-heading"
          className="flex flex-col gap-3 border-t pt-6"
        >
          <div>
            <h3
              id="org-delete-heading"
              className="text-sm font-medium text-foreground"
            >
              Delete organization
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Permanently remove <strong className="text-foreground">{orgName}</strong>
              , its projects, and mutable compliance records. Append-only
              evidence rows remain for audit unless an operator purges them
              outside the app.
            </p>
          </div>

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
                  variant="destructive"
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
                    onClick={() => {
                      if (deleteReady) setDeleteConfirmOpen(false);
                    }}
                  >
                    {deletePending ? "Deleting…" : "Delete permanently"}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </form>

          {deleteState.error ? (
            <p role="alert" className="text-sm text-destructive">
              {deleteState.error}
            </p>
          ) : null}
          {deleteState.message ? (
            <p role="status" className="text-sm text-muted-foreground">
              {deleteState.message}
            </p>
          ) : null}
        </section>
      </CardContent>
    </Card>
  );
}

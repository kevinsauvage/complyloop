"use client";

import { useActionState, useState } from "react";
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

const initial: ActionMessageState = { error: null, message: null };

export function OrgDataLifecycle({
  orgId,
  orgName,
}: {
  orgId: string;
  orgName: string;
}) {
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteOrgAction,
    initial,
  );
  useActionToast(deleteState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data &amp; deletion</CardTitle>
        <CardDescription>
          Owner-only export of organization data, or delete the organization.
          Evidence history is retained for audit after deletion.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              setExportError(null);
              const result = await exportOrgDataAction(orgId);
              setExporting(false);
              if (result.error || !result.json) {
                setExportError(result.error ?? "Export failed.");
                return;
              }
              const blob = new Blob([result.json], {
                type: "application/json",
              });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = `complyloop-org-${orgId}.json`;
              anchor.click();
              URL.revokeObjectURL(url);
            }}
          >
            {exporting ? "Exporting…" : "Export organization JSON"}
          </Button>
          {exportError ? (
            <p role="alert" className="text-sm text-destructive">
              {exportError}
            </p>
          ) : null}
        </div>

        <form action={deleteAction} className="flex flex-col gap-3 border-t pt-4">
          <input type="hidden" name="orgId" value={orgId} />
          <p className="text-sm text-muted-foreground">
            Permanently delete <strong className="text-foreground">{orgName}</strong>
            , its projects, and mutable compliance records. Type{" "}
            <code className="text-xs">DELETE</code> to confirm.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-delete">Confirmation</Label>
            <Input
              id="confirm-delete"
              name="confirm"
              autoComplete="off"
              placeholder="DELETE"
              required
            />
          </div>
          <Button
            type="submit"
            variant="destructive"
            size="sm"
            disabled={deletePending}
          >
            {deletePending ? "Deleting…" : "Delete organization"}
          </Button>
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
        </form>
      </CardContent>
    </Card>
  );
}

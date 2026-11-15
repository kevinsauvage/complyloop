"use client";

import { useState } from "react";

import { StatefulActionForm } from "@/components/forms/stateful-action-form";
import { Button } from "@/components/ui/button";
import { dismissFindingAction } from "@/server/actions/remediation";

import { DismissFindingFields } from "./dismiss-finding-fields";

/** Persistent secondary actions: dismiss (with confirm) + jump to fix notes. */
export function SecondaryFindingActions({
  findingId,
  showHandoff,
}: {
  findingId: string;
  showHandoff: boolean;
}) {
  const [dismissOpen, setDismissOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={dismissOpen}
          aria-controls="dismiss-finding-form"
          onClick={() => setDismissOpen((open) => !open)}
        >
          {dismissOpen ? "Close dismiss form" : "Dismiss…"}
        </Button>
        {showHandoff ? (
          <Button variant="outline" size="sm" asChild>
            <a href="#copy-handoff">Copy fix notes</a>
          </Button>
        ) : null}
      </div>
      {dismissOpen ? (
        <div
          id="dismiss-finding-form"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-4"
        >
          <StatefulActionForm
            action={dismissFindingAction.bind(null, findingId)}
            submitLabel="Dismiss finding"
            variant="destructive"
            size="sm"
            className="flex flex-col gap-4"
            confirmMessage="Dismiss this finding? The reason and note are kept as evidence."
            confirmTitle="Dismiss finding"
          >
            <DismissFindingFields
              reasonId="dismiss-reason"
              noteId="dismiss-note"
            />
          </StatefulActionForm>
        </div>
      ) : null}
    </div>
  );
}

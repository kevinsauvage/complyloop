"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ActionState, initialActionState } from "@/core/action-state";
import { useActionToast } from "@/hooks/use-action-toast";

export function CreateOrgForm({
  action,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    initialActionState,
  );
  useActionToast(state, pending);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="orgName">Organization name</Label>
        <Input
          id="orgName"
          name="name"
          type="text"
          required
          placeholder="Acme Engineering"
          aria-describedby={
            !state.ok && state.message && !pending
              ? "orgName-error"
              : "orgName-hint"
          }
          aria-invalid={!state.ok && state.message ? true : undefined}
        />
        <p id="orgName-hint" className="text-xs text-muted-foreground">
          Used for the URL slug (lowercase letters, numbers, dashes) — you can
          rename it later.
        </p>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create organization"}
      </Button>
      {!state.ok && state.message && !pending ? (
        <p id="orgName-error" role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

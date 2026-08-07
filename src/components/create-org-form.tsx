"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CreateOrgFormState } from "@/server/actions/org";

const initial: CreateOrgFormState = { error: null };

export function CreateOrgForm({
  action,
}: {
  action: (
    previous: CreateOrgFormState,
    formData: FormData,
  ) => Promise<CreateOrgFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const errorId = useId();

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
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? errorId : undefined}
        />
      </div>
      {state.error ? (
        <p id={errorId} className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create organization"}
      </Button>
    </form>
  );
}

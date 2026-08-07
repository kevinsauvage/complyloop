"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { ActionMessageState } from "@/server/action-state";

const initial: ActionMessageState = { error: null, message: null };

export function AiActionForm({
  action,
  submitLabel,
  pendingLabel,
  disabled,
}: {
  action: (
    previous: ActionMessageState,
    formData: FormData,
  ) => Promise<ActionMessageState>;
  submitLabel: string;
  pendingLabel: string;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction}>
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={disabled || pending}
      >
        {pending ? pendingLabel : submitLabel}
      </Button>
      {state.error ? (
        <p role="alert" className="mt-1.5 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p role="status" className="mt-1.5 text-xs text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

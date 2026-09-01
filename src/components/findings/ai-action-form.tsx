"use client";

import { useActionState } from "react";
import { ActionFeedback } from "@/components/action-feedback";
import { Button } from "@/components/ui/button";
import { useActionToast } from "@/hooks/use-action-toast";
import type { ActionMessageState } from "@/server/action-state";

const initial: ActionMessageState = { error: null, message: null };

export function AiActionForm({
  action,
  submitLabel,
  retryLabel,
  pendingLabel,
  disabled,
  variant = "outline",
}: {
  action: (
    previous: ActionMessageState,
    formData: FormData,
  ) => Promise<ActionMessageState>;
  submitLabel: string;
  retryLabel?: string;
  pendingLabel: string;
  disabled?: boolean;
  variant?: "default" | "outline";
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  useActionToast(state);
  const buttonLabel = pending
    ? pendingLabel
    : state.error
      ? (retryLabel ?? submitLabel)
      : submitLabel;

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <Button
        type="submit"
        variant={variant}
        size="sm"
        disabled={disabled || pending}
      >
        {buttonLabel}
      </Button>
      <ActionFeedback state={state} className="text-xs" />
    </form>
  );
}

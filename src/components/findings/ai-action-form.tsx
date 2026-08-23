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
  useActionToast(state);

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={disabled || pending}
      >
        {pending ? pendingLabel : submitLabel}
      </Button>
      <ActionFeedback state={state} className="text-xs" />
    </form>
  );
}

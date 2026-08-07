"use client";

import { useActionState, useId, type ReactNode } from "react";
import type { VariantProps } from "class-variance-authority";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { useActionToast } from "@/hooks/use-action-toast";
import type { ActionMessageState } from "@/server/action-state";

const initialState: ActionMessageState = { error: null, message: null };

type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
type ButtonSize = VariantProps<typeof buttonVariants>["size"];

export function StatefulActionForm({
  action,
  submitLabel,
  pendingLabel,
  variant = "default",
  size = "default",
  children,
  className,
  confirmMessage,
  confirmTitle,
}: {
  action: (
    previous: ActionMessageState,
    formData: FormData,
  ) => Promise<ActionMessageState>;
  submitLabel: string;
  pendingLabel?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
  className?: string;
  /** When set, requires AlertDialog confirmation before the form submits. */
  confirmMessage?: string;
  confirmTitle?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formId = useId();
  useActionToast(state);

  return (
    <form id={formId} action={formAction} className={className}>
      {children}
      <div>
        {confirmMessage ? (
          <ConfirmSubmitButton
            label={submitLabel}
            pendingLabel={pendingLabel}
            confirmMessage={confirmMessage}
            confirmTitle={confirmTitle}
            variant={variant}
            size={size}
            formId={formId}
          />
        ) : (
          <Button type="submit" disabled={pending} variant={variant} size={size}>
            {pending ? (pendingLabel ?? "Working…") : submitLabel}
          </Button>
        )}
      </div>
    </form>
  );
}

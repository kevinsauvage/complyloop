"use client";

import { useActionState, useId, type ReactNode } from "react";
import type { VariantProps } from "class-variance-authority";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { buttonVariants } from "@/components/ui/button";
import { useActionToast } from "@/hooks/use-action-toast";
import {
  initialActionState,
  type ActionState,
} from "@/server/action-state";

const initialState: ActionState = initialActionState;

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
  retryLabel,
  disabled = false,
}: {
  action: (
    previous: ActionState,
    formData: FormData,
  ) => Promise<ActionState>;
  submitLabel: string;
  pendingLabel?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
  className?: string;
  /** When set, requires AlertDialog confirmation before the form submits. */
  confirmMessage?: string;
  confirmTitle?: string;
  /** When set, submit label switches to this after an error (e.g. AI retry). */
  retryLabel?: string;
  /** Disables the submit button (state already satisfied). */
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formId = useId();
  useActionToast(state, pending);

  const showRetry = !state.ok && Boolean(state.message) && !pending && Boolean(retryLabel);
  const feedbackRole = state.ok ? "status" : "alert";

  return (
    <form id={formId} action={formAction} className={className}>
      {children}
      <div className="flex flex-col gap-2">
        <ConfirmSubmitButton
          label={showRetry ? (retryLabel ?? submitLabel) : submitLabel}
          pendingLabel={pendingLabel}
          variant={variant}
          size={size}
          formId={formId}
          disabled={disabled}
          {...(confirmMessage ? { confirmMessage, confirmTitle } : {})}
        />
        {!pending && state.message ? (
          <p
            role={feedbackRole}
            className={
              state.ok ? "text-sm text-status-passed" : "text-sm text-destructive"
            }
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

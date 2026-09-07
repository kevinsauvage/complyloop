"use client";

import { useActionState, useId, type ReactNode } from "react";
import type { VariantProps } from "class-variance-authority";
import { ActionFeedback } from "@/components/action-feedback";
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
  retryLabel,
  disabled = false,
  /** When false, success copy is toast-only (errors stay inline). */
  inlineSuccess = true,
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
  /** When set, submit label switches to this after an error (e.g. AI retry). */
  retryLabel?: string;
  /** Disables the submit button (state already satisfied). */
  disabled?: boolean;
  inlineSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formId = useId();
  useActionToast(state, pending);

  const feedbackState =
    inlineSuccess || state.error
      ? state
      : { error: state.error, message: null };

  const buttonLabel = pending
    ? (pendingLabel ?? "Working…")
    : state.error && retryLabel
      ? retryLabel
      : submitLabel;

  return (
    <form id={formId} action={formAction} className={className}>
      {children}
      <div className="flex flex-col gap-2">
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
          <Button
            type="submit"
            disabled={pending || disabled}
            variant={variant}
            size={size}
          >
            {buttonLabel}
          </Button>
        )}
        <ActionFeedback state={feedbackState} />
      </div>
    </form>
  );
}

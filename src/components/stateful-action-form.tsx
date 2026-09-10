"use client";

import { useActionState, useId, type ReactNode } from "react";
import type { VariantProps } from "class-variance-authority";
import {
  ConfirmSubmitButton,
  resolveSubmitLabel,
} from "@/components/confirm-submit-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { useActionToast } from "@/hooks/use-action-toast";
import {
  emptyActionMessageState,
  type ActionMessageState,
} from "@/server/action-state";

const initialState: ActionMessageState = emptyActionMessageState;

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
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formId = useId();
  useActionToast(state, pending);

  const buttonLabel =
    state.error && !pending && retryLabel
      ? retryLabel
      : resolveSubmitLabel(pending, submitLabel, pendingLabel);

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
            disabled={disabled}
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
        {state.error && !pending ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
        {state.message && !state.error && !pending ? (
          <p role="status" className="text-sm text-status-passed">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

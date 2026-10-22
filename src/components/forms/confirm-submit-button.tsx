"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { ButtonSize, ButtonVariant } from "@/components/ui/button";
import { Button } from "@/components/ui/button";

function resolveSubmitLabel(
  pending: boolean,
  label: string,
  pendingLabel?: string,
): string {
  return pending ? (pendingLabel ?? "Working…") : label;
}

/**
 * Submit control. With `confirmMessage`, gates submission behind an AlertDialog
 * (replaces `window.confirm`); without it, renders a plain submit button. Uses
 * the HTML form= attribute so the confirm action still submits a portaled dialog.
 */
export function ConfirmSubmitButton({
  label,
  pendingLabel,
  confirmMessage,
  confirmTitle = "Confirm action",
  variant = "default",
  size = "default",
  className,
  formId: formIdProp,
  disabled = false,
}: {
  label: string;
  pendingLabel?: string;
  /** When omitted, renders a plain submit button with no confirmation dialog. */
  confirmMessage?: string;
  confirmTitle?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  /** Required when the dialog action is portaled outside the form. */
  formId?: string;
  /** Disables the trigger (state already satisfied). */
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const [open, setOpen] = useState(false);
  const generatedId = useId();
  const formId = formIdProp ?? generatedId;
  const triggerDisabled = pending || disabled;

  // Close only after the action settles — never on click. Closing early
  // strands failures below a dead trigger; closing on settle returns focus
  // to the trigger while the inline `role="alert"` announces the result.
  const wasPending = useRef(false);
  useEffect(() => {
    if (pending) {
      wasPending.current = true;
      return;
    }
    if (wasPending.current) {
      wasPending.current = false;
      setOpen(false);
    }
  }, [pending]);

  const buttonLabel = resolveSubmitLabel(pending, label, pendingLabel);

  if (!confirmMessage) {
    return (
      <Button
        type="submit"
        variant={variant}
        size={size}
        disabled={triggerDisabled}
        className={className}
      >
        {buttonLabel}
      </Button>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          disabled={triggerDisabled}
          className={className}
        >
          {buttonLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
          <AlertDialogDescription>{confirmMessage}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
          <Button
            type="submit"
            form={formId}
            disabled={pending}
            variant={variant === "destructive" ? "destructive" : "default"}
            className="pointer-events-auto"
          >
            {buttonLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

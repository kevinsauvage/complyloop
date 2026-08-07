"use client";

import { useId, useState } from "react";
import { useFormStatus } from "react-dom";
import type { VariantProps } from "class-variance-authority";
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
import { Button, buttonVariants } from "@/components/ui/button";

type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
type ButtonSize = VariantProps<typeof buttonVariants>["size"];

/**
 * Submit control gated by AlertDialog confirmation (replaces window.confirm).
 * Uses the HTML form= attribute so the confirm action still submits a portaled dialog.
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
}: {
  label: string;
  pendingLabel?: string;
  confirmMessage: string;
  confirmTitle?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  /** Required when the dialog action is portaled outside the form. */
  formId?: string;
}) {
  const { pending } = useFormStatus();
  const [open, setOpen] = useState(false);
  const generatedId = useId();
  const formId = formIdProp ?? generatedId;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          disabled={pending}
          className={className}
        >
          {pending ? (pendingLabel ?? "Working…") : label}
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
            onClick={() => setOpen(false)}
            className="pointer-events-auto"
          >
            {pending ? (pendingLabel ?? "Working…") : label}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit control that asks for confirmation before the form posts.
 * Uses the native confirm dialog — enough for MVP destructive gates.
 */
export function ConfirmSubmitButton({
  label,
  pendingLabel,
  confirmMessage,
  className,
}: {
  label: string;
  pendingLabel?: string;
  confirmMessage: string;
  className: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className} disabled:opacity-50`}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {pending ? (pendingLabel ?? "Working…") : label}
    </button>
  );
}

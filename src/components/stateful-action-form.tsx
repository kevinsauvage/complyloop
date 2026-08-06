"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionMessageState } from "@/server/action-state";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

const initialState: ActionMessageState = { error: null, message: null };

export function StatefulActionForm({
  action,
  submitLabel,
  pendingLabel,
  submitClassName,
  children,
  className,
  confirmMessage,
}: {
  action: (
    previous: ActionMessageState,
    formData: FormData,
  ) => Promise<ActionMessageState>;
  submitLabel: string;
  pendingLabel?: string;
  submitClassName: string;
  children?: ReactNode;
  className?: string;
  /** When set, requires native confirm before the form submits. */
  confirmMessage?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className={className}>
      {children}
      {state.error ? (
        <p className="text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p className="text-sm text-emerald-700" role="status">
          {state.message}
        </p>
      ) : null}
      <div>
        {confirmMessage ? (
          <ConfirmSubmitButton
            label={submitLabel}
            pendingLabel={pendingLabel}
            confirmMessage={confirmMessage}
            className={submitClassName}
          />
        ) : (
          <button
            type="submit"
            disabled={pending}
            className={`${submitClassName} disabled:opacity-50`}
          >
            {pending ? (pendingLabel ?? "Working…") : submitLabel}
          </button>
        )}
      </div>
    </form>
  );
}

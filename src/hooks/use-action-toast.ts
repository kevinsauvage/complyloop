"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

/** Minimal shape shared by `ActionMessageState` / form error states. */
export type ToastableActionState = {
  error: string | null;
  message?: string | null;
};

export type ActionToastSuccessAction = {
  label: string;
  onClick: () => void;
};

/**
 * Surfaces `useActionState` results via the global Sonner toaster.
 * Toasts when `pending` flips true → false so the same success copy still
 * fires on every submit (message text alone is not a unique key).
 *
 * Success owns the toast; errors belong inline next to the failing control
 * (`role="alert"` + `aria-describedby`). Pass `toastErrors: true` only for
 * fire-and-forget actions with no inline error slot.
 */
export function useActionToast(
  state: ToastableActionState,
  pending = false,
  options?: {
    successDuration?: number;
    successAction?: ActionToastSuccessAction | null;
    toastErrors?: boolean;
  },
): void {
  const wasPending = useRef(false);
  const successDuration = options?.successDuration ?? 4_000;
  const successAction = options?.successAction;
  const toastErrors = options?.toastErrors ?? false;

  useEffect(() => {
    if (pending) {
      wasPending.current = true;
      return;
    }
    if (!wasPending.current) return;
    wasPending.current = false;

    if (state.error) {
      if (toastErrors) toast.error(state.error, { duration: 8_000 });
      return;
    }
    if (state.message) {
      toast.success(state.message, {
        duration: successDuration,
        ...(successAction ? { action: successAction } : {}),
      });
    }
  }, [pending, state.error, state.message, successDuration, successAction, toastErrors]);
}

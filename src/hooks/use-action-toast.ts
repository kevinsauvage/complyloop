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
 */
export function useActionToast(
  state: ToastableActionState,
  pending = false,
  options?: {
    successDuration?: number;
    successAction?: ActionToastSuccessAction | null;
  },
): void {
  const wasPending = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (pending) {
      wasPending.current = true;
      return;
    }
    if (!wasPending.current) return;
    wasPending.current = false;

    if (state.error) {
      toast.error(state.error, { duration: 8_000 });
      return;
    }
    if (state.message) {
      const successAction = optionsRef.current?.successAction ?? null;
      toast.success(state.message, {
        duration: optionsRef.current?.successDuration ?? 4_000,
        ...(successAction ? { action: successAction } : {}),
      });
    }
  }, [pending, state.error, state.message]);
}

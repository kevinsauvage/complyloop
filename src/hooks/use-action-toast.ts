"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

/** Minimal shape shared by `ActionMessageState` / form error states. */
export type ToastableActionState = {
  error: string | null;
  message?: string | null;
};

/**
 * Surfaces `useActionState` results via the global Sonner toaster.
 * Toasts when `pending` flips true → false so the same success copy still
 * fires on every submit (message text alone is not a unique key).
 * Pair with `ActionFeedback` for persistent inline copy next to the form.
 */
export function useActionToast(
  state: ToastableActionState,
  pending = false,
): void {
  const wasPending = useRef(false);

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
      toast.success(state.message, { duration: 4_000 });
    }
  }, [pending, state.error, state.message]);
}

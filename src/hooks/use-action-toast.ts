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
 * Call once with the state object from `useActionState`.
 */
export function useActionToast(state: ToastableActionState): void {
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    const key = state.error
      ? `error:${state.error}`
      : state.message
        ? `message:${state.message}`
        : null;
    if (key == null || key === lastKey.current) return;
    lastKey.current = key;

    if (state.error) {
      toast.error(state.error);
      return;
    }
    if (state.message) {
      toast.success(state.message);
    }
  }, [state.error, state.message]);
}

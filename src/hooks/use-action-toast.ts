"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { ActionState } from "@/core/action-state";

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
  state: ActionState,
  pending = false,
  options?: {
    successDuration?: number;
    successAction?: { label: string; onClick: () => void } | null;
    toastErrors?: boolean;
  },
): void {
  const {
    successDuration = 4_000,
    successAction,
    toastErrors = false,
  } = options ?? {};
  const wasPending = useRef(false);

  useEffect(() => {
    const finished = wasPending.current && !pending;
    wasPending.current = pending;
    if (!finished || !state.message) return;

    if (!state.ok) {
      if (toastErrors) toast.error(state.message, { duration: 8_000 });
      return;
    }
    toast.success(state.message, {
      duration: successDuration,
      ...(successAction ? { action: successAction } : {}),
    });
  }, [
    pending,
    state.ok,
    state.message,
    successDuration,
    successAction,
    toastErrors,
  ]);
}

"use client";

import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useActionState,
  useEffect,
  useId,
  useRef,
} from "react";

import type { ButtonSize, ButtonVariant } from "@/components/ui/button";
import {
  type ActionState,
  initialActionState,
} from "@/core/actions/action-state";
import { useActionToast } from "@/hooks/use-action-toast";

import { ConfirmSubmitButton } from "./confirm-submit-button";

const initialState: ActionState = initialActionState;

/**
 * Isolated so `useRouter()` (which requires App Router context) is only
 * called when `refreshOnSuccess` is actually requested. Otherwise every
 * consumer — and every test rendering one — would need router context.
 */
function RefreshOnSuccess({ message }: { message: string }) {
  const router = useRouter();
  const refreshedFor = useRef<string | null>(null);

  useEffect(() => {
    if (refreshedFor.current === message) return;
    refreshedFor.current = message;
    router.refresh();
  }, [message, router]);

  return null;
}

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
  refreshOnSuccess = false,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
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
  /**
   * Refresh server components after a successful submit. Opt-in: most forms
   * already land on fresh data via `revalidatePath`, but `useActionState`
   * views do not re-render from revalidation alone — flows that must show
   * the mutation immediately (e.g. a completed direct assessment run) set
   * this.
   */
  refreshOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formId = useId();
  useActionToast(state, pending);

  // `revalidatePath` in the action invalidates the cache but never re-renders
  // this view: without an explicit refresh the user stares at stale data
  // (e.g. the first-assessment checklist with no sign of the queued job).
  const shouldRefresh =
    refreshOnSuccess && !pending && state.ok && Boolean(state.message);

  const showRetry =
    !state.ok && Boolean(state.message) && !pending && Boolean(retryLabel);
  const feedbackRole = state.ok ? "status" : "alert";

  return (
    <form id={formId} action={formAction} className={className}>
      {children}
      {shouldRefresh ? (
        <RefreshOnSuccess message={state.message ?? ""} />
      ) : null}
      <div className="flex flex-col gap-2">
        <ConfirmSubmitButton
          label={showRetry ? (retryLabel ?? submitLabel) : submitLabel}
          pendingLabel={pendingLabel}
          variant={variant}
          size={size}
          formId={formId}
          disabled={disabled}
          {...(confirmMessage ? { confirmMessage, confirmTitle } : {})}
        />
        {!pending && state.message ? (
          <p
            role={feedbackRole}
            className={
              state.ok
                ? "text-sm text-status-passed"
                : "text-sm text-destructive"
            }
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

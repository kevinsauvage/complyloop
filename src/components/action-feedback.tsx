import type { ActionMessageState } from "@/server/action-state";
import { cn } from "@/lib/utils";

/**
 * Inline success/error copy for server actions.
 * Complements toasts so feedback stays visible next to the control that failed
 * and is announced to assistive tech via role=alert / role=status.
 */
export function ActionFeedback({
  state,
  className,
}: {
  state: Pick<ActionMessageState, "error" | "message">;
  className?: string;
}) {
  if (state.error) {
    return (
      <p
        role="alert"
        className={cn("text-sm text-destructive", className)}
      >
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p
        role="status"
        className={cn("text-sm text-muted-foreground", className)}
      >
        {state.message}
      </p>
    );
  }
  return null;
}

"use client";

import { StatefulActionForm } from "@/components/stateful-action-form";
import type { ActionMessageState } from "@/server/action-state";

export function AiActionForm({
  action,
  submitLabel,
  retryLabel,
  pendingLabel,
  disabled,
  variant = "outline",
}: {
  action: (
    previous: ActionMessageState,
    formData: FormData,
  ) => Promise<ActionMessageState>;
  submitLabel: string;
  retryLabel?: string;
  pendingLabel: string;
  disabled?: boolean;
  variant?: "default" | "outline";
}) {
  return (
    <StatefulActionForm
      action={action}
      submitLabel={submitLabel}
      retryLabel={retryLabel}
      pendingLabel={pendingLabel}
      variant={variant}
      size="sm"
      disabled={disabled}
      className="flex flex-col gap-1.5"
    />
  );
}

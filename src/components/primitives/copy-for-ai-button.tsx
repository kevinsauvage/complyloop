"use client";

import { Check, Sparkles } from "lucide-react";

import { useCopy } from "@/components/primitives/use-copy";
import { Button } from "@/components/ui/button";

/**
 * Copies a ready-to-paste Markdown prompt for the developer's own coding
 * assistant. Plain clipboard text — nothing is sent to a model from here.
 */
export function CopyForAiButton({
  text,
  label = "Copy for AI",
  description,
}: {
  text: string;
  label?: string;
  /** Extra context for screen readers, e.g. "12 unable-to-verify requirements". */
  description?: string;
}) {
  const { status, copied, copy } = useCopy(text);
  const announcement =
    status === "copied"
      ? "Prompt copied"
      : status === "error"
        ? "Could not copy"
        : "";

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={copy}
        aria-label={description ? `${label}: ${description}` : undefined}
      >
        {copied ? (
          <Check data-icon="inline-start" aria-hidden />
        ) : (
          <Sparkles data-icon="inline-start" aria-hidden />
        )}
        {label}
      </Button>
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </>
  );
}

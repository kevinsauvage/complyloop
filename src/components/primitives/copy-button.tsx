"use client";

import { useCopy } from "@/components/primitives/use-copy";
import { Button } from "@/components/ui/button";

export function CopyButton({ label, text }: { label: string; text: string }) {
  const { status, copy } = useCopy(text);
  const announcement =
    status === "copied" ? "Copied" : status === "error" ? "Could not copy" : "";

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={copy}>
        {label}
      </Button>
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </>
  );
}

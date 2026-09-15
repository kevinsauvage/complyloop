"use client";

import { Button } from "@/components/ui/button";
import { useCopy } from "@/hooks/use-copy";

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

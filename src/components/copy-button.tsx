"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCopyText } from "@/hooks/use-copy-text";

export function CopyButton({
  label,
  text,
}: {
  label: string;
  text: string;
}) {
  const [announcement, setAnnouncement] = useState("");
  const [, copy] = useCopyText();

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={async () => {
          try {
            await copy(text);
            setAnnouncement("Copied");
          } catch {
            setAnnouncement("Could not copy");
            toast.error("Could not copy to clipboard");
          }
        }}
      >
        {label}
      </Button>
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </>
  );
}

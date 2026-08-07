"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyButton({
  label,
  text,
}: {
  label: string;
  text: string;
}) {
  const [announcement, setAnnouncement] = useState("");

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="xs"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setAnnouncement("Copied");
            toast.success("Copied to clipboard");
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

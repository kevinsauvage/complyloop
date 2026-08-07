"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyButton({
  label,
  text,
}: {
  label: string;
  text: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast.success("Copied to clipboard");
        } catch {
          toast.error("Could not copy to clipboard");
        }
      }}
    >
      {label}
    </Button>
  );
}

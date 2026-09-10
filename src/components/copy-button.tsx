"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/copy-text";

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
        size="sm"
        onClick={async () => {
          const ok = await copyText(text);
          setAnnouncement(ok ? "Copied" : "Could not copy");
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
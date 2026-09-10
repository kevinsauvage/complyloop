"use client";

import { useState } from "react";
import { toast } from "sonner";

type CopyStatus = "idle" | "copied" | "error";

/**
 * Copy-to-clipboard with a transient status flag for button feedback.
 * `copied` resets after `resetMs`; `error` persists until the next attempt.
 */
export function useCopy(
  text: string,
  resetMs = 2000,
): { status: CopyStatus; copied: boolean; copy: () => Promise<void> } {
  const [status, setStatus] = useState<CopyStatus>("idle");

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
      setStatus("copied");
      setTimeout(() => setStatus("idle"), resetMs);
    } catch {
      toast.error("Could not copy to clipboard");
      setStatus("error");
    }
  }

  return { status, copied: status === "copied", copy };
}

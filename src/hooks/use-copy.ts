"use client";

import { useState } from "react";
import { copyText } from "@/lib/copy-text";

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
    const ok = await copyText(text);
    setStatus(ok ? "copied" : "error");
    if (ok) {
      setTimeout(() => setStatus("idle"), resetMs);
    }
  }

  return { status, copied: status === "copied", copy };
}

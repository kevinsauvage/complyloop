"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/** Shared clipboard copy with announcement + auto-reset. Returns [copied, copy]. */
export function useCopyText(resetMs = 2000): [boolean, (text: string) => Promise<void>] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), resetMs);
      } catch {
        setCopied(false);
        toast.error("Could not copy to clipboard");
      }
    },
    [resetMs],
  );

  return [copied, copy];
}

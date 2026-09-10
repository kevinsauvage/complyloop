"use client";

import { useState } from "react";
import { Check, Copy, WrapText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCopy } from "@/hooks/use-copy";

/** Code viewer with copy + wrap controls — long diffs stay readable on 320px viewports. */
export function CodeBlock({
  children,
  filename,
}: {
  children: string;
  /** Optional file path shown in the header row (truncated). */
  filename?: string;
}) {
  const [wrap, setWrap] = useState(false);
  const { copied, copy: handleCopy } = useCopy(children);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        {filename ? (
          <p
            title={filename}
            className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground"
          >
            {filename}
          </p>
        ) : (
          <span className="flex-1" aria-hidden />
        )}
        <span aria-live="polite" className="sr-only">
          {copied ? "Copied to clipboard" : ""}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy code to clipboard"}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {copied ? (
            <Check className="size-3.5" aria-hidden />
          ) : (
            <Copy className="size-3.5" aria-hidden />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={() => setWrap((value) => !value)}
          aria-pressed={wrap}
          aria-label={wrap ? "Disable line wrapping" : "Enable line wrapping"}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
            wrap
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <WrapText className="size-3.5" aria-hidden />
          {wrap ? "No wrap" : "Wrap"}
        </button>
      </div>
      <pre
        className={cn(
          "surface-panel rounded-xl px-4 py-3 font-mono text-xs leading-relaxed text-foreground",
          wrap
            ? "break-all whitespace-pre-wrap"
            : // Always wrap on narrow viewports even when the toggle is off.
              "overflow-x-auto whitespace-pre max-sm:break-all max-sm:whitespace-pre-wrap",
        )}
      >
        <code className="break-all">{children}</code>
      </pre>
    </div>
  );
}
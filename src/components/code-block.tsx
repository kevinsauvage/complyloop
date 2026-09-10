"use client";

import { useState } from "react";

/** Code viewer with a wrap toggle — long diffs stay readable on 320px viewports. */
export function CodeBlock({ children }: { children: string }) {
  const [wrap, setWrap] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setWrap((value) => !value)}
          aria-pressed={wrap}
          className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {wrap ? "No wrap" : "Wrap"}
        </button>
      </div>
      <pre
        className={
          wrap
            ? "surface-panel rounded-xl px-4 py-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-foreground"
            : "surface-panel overflow-x-auto rounded-xl px-4 py-3 font-mono text-xs leading-relaxed text-foreground"
        }
      >
        <code className="break-all">{children}</code>
      </pre>
    </div>
  );
}

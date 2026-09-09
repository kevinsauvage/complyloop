"use client";

import type { ReactElement } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Client island — tooltips require interactivity; badge markup stays in the parent. */
export function BadgeWithDescription({
  description,
  children,
}: {
  description: string;
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* No tabindex here: badges often render inside links, where a nested
            focusable would be invalid. The definition is always exposed to
            assistive tech as text; the tooltip stays a hover enhancement. */}
        <span className="inline-flex cursor-help">
          {children}
          <span className="sr-only">: {description}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-pretty">
        {description}
      </TooltipContent>
    </Tooltip>
  );
}

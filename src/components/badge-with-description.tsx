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
        <span className="inline-flex cursor-help">{children}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-pretty">
        {description}
      </TooltipContent>
    </Tooltip>
  );
}

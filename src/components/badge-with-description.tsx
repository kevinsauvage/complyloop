"use client";

import type { ReactElement, ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

/** Wrap arbitrary badge chrome when the trigger is not a single element. */
export function BadgeWithDescriptionTrigger({
  description,
  children,
}: {
  description: string;
  children: ReactNode;
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

"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Compact trigger for connecting another project when one is already active. */
export function ConnectProjectDialog({
  children,
  triggerLabel = "Create project",
}: {
  children: ReactNode;
  triggerLabel?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full bg-signal"
              aria-hidden
            />
            <DialogTitle>{triggerLabel}</DialogTitle>
          </div>
          <DialogDescription>
            Pick a GitHub repository. Connecting it creates the project and
            opens its dashboard, ready for a first assessment.
          </DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

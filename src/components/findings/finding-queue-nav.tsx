"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  findingDetailHref,
  findingsListHref,
  hasActiveFindingFilters,
  type FindingListParams,
} from "@/core/filters";
import { ChevronLeft, ChevronRight } from "lucide-react";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function FindingQueueNav({
  listParams,
  prevId,
  nextId,
  index,
  total,
}: {
  listParams: FindingListParams;
  prevId: string | null;
  nextId: string | null;
  index: number;
  total: number;
}) {
  const router = useRouter();
  const inQueue = index >= 0 && total > 0;
  const [liveMessage, setLiveMessage] = useState("");
  const tabLabel =
    listParams.tab === "by_cause"
      ? "Root cause"
      : listParams.tab === "resolved"
        ? "Resolved"
        : listParams.tab === "dismissed"
          ? "Dismissed"
          : "Open";
  const filteredSuffix = hasActiveFindingFilters(listParams)
    ? " · filtered"
    : "";

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      if (event.key === "j" && nextId) {
        event.preventDefault();
        setLiveMessage(`Moving to finding ${index + 2} of ${total}`);
        router.push(findingDetailHref(nextId, listParams));
      } else if (event.key === "k" && prevId) {
        event.preventDefault();
        setLiveMessage(`Moving to finding ${index} of ${total}`);
        router.push(findingDetailHref(prevId, listParams));
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, listParams, nextId, prevId, router, total]);

  if (!inQueue) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          This finding isn&apos;t in the current {tabLabel} queue
          {hasActiveFindingFilters(listParams)
            ? " — filters may be hiding it"
            : ""}
          .{" "}
          <Link
            href={findingsListHref({ tab: "open" })}
            className="font-medium text-foreground underline underline-offset-4"
          >
            View all open findings
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
      >
        {liveMessage}
      </p>
      <p className="text-xs text-muted-foreground">
        {index + 1} of {total} · {tabLabel}
        {filteredSuffix}
        <span className="hidden sm:inline">
          {" "}
          · <kbd className="rounded border border-border px-1 font-mono">j</kbd>{" "}
          next ·{" "}
          <kbd className="rounded border border-border px-1 font-mono">k</kbd>{" "}
          previous
        </span>
      </p>
      <div className="flex items-center gap-1">
        {prevId ? (
          <Button variant="outline" size="sm" asChild>
            <Link
              href={findingDetailHref(prevId, listParams)}
              title="Previous finding (K)"
            >
              <ChevronLeft className="size-4" aria-hidden />
              Previous
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled title="No previous finding">
            <ChevronLeft className="size-4" aria-hidden />
            Previous
          </Button>
        )}
        {nextId ? (
          <Button variant="outline" size="sm" asChild>
            <Link
              href={findingDetailHref(nextId, listParams)}
              title="Next finding (J)"
            >
              Next
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled title="No next finding">
            Next
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}

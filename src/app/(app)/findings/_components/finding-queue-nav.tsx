"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import {
  findingDetailHref,
  type FindingListParams,
  findingsListHref,
  hasActiveFindingFilters,
} from "@/core/filter-params/findings";

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

/**
 * Modal surfaces own the keyboard while open: j/k must not navigate the page
 * behind a dialog, sheet, menu or listbox (WCAG 2.1.4 — single-key shortcuts
 * need to be scoped and escapable).
 */
function isInsideModalSurface(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(
      '[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],[aria-modal="true"]',
    ) !== null
  );
}

/**
 * WCAG 2.1.4 (RGAA 12.10): single-key shortcuts must be possible to turn off
 * (speech input types letters too). On by default, remembered per browser.
 */
const SHORTCUTS_STORAGE_KEY = "complyloop:finding-queue-shortcuts";
const SHORTCUTS_CHANGED_EVENT = "complyloop:finding-queue-shortcuts-changed";

let shortcutsEnabled: boolean | null = null;

function readShortcutsEnabled(): boolean {
  if (shortcutsEnabled === null) {
    try {
      shortcutsEnabled =
        window.localStorage.getItem(SHORTCUTS_STORAGE_KEY) !== "off";
    } catch {
      // Storage blocked (private mode, policy): default on for this page.
      shortcutsEnabled = true;
    }
  }
  return shortcutsEnabled;
}

function writeShortcutsEnabled(enabled: boolean): void {
  shortcutsEnabled = enabled;
  try {
    window.localStorage.setItem(SHORTCUTS_STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Storage blocked: the choice still holds until the page reloads.
  }
  window.dispatchEvent(new Event(SHORTCUTS_CHANGED_EVENT));
}

function subscribeShortcuts(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== SHORTCUTS_STORAGE_KEY) return;
    shortcutsEnabled = null;
    onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(SHORTCUTS_CHANGED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SHORTCUTS_CHANGED_EVENT, onChange);
  };
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
  const shortcutsOn = useSyncExternalStore(
    subscribeShortcuts,
    readShortcutsEnabled,
    () => true,
  );
  const inQueue = index >= 0 && total > 0;
  const [liveMessage, setLiveMessage] = useState("");
  const tabLabel =
    listParams.tab === "resolved"
      ? "Resolved"
      : listParams.tab === "dismissed"
        ? "Dismissed"
        : "Open";
  const filteredSuffix = hasActiveFindingFilters(listParams)
    ? " · filtered"
    : "";

  useEffect(() => {
    if (!shortcutsOn) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // Holding the key must not fire a burst of navigations.
      if (event.repeat) return;
      if (isEditableTarget(event.target)) return;
      if (isInsideModalSurface(event.target)) return;
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
  }, [index, listParams, nextId, prevId, router, shortcutsOn, total]);

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
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <p>
          {index + 1} of {total} · {tabLabel}
          {filteredSuffix}
          {shortcutsOn ? (
            <span className="hidden sm:inline">
              {" "}
              ·{" "}
              <kbd className="rounded border border-border px-1 font-mono">
                j
              </kbd>{" "}
              next ·{" "}
              <kbd className="rounded border border-border px-1 font-mono">
                k
              </kbd>{" "}
              previous
            </span>
          ) : null}
        </p>
        <label className="inline-flex min-h-6 cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            className="size-4 accent-foreground"
            checked={shortcutsOn}
            onChange={(event) => writeShortcutsEnabled(event.target.checked)}
          />
          Keyboard shortcuts
        </label>
      </div>
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
          <Button
            variant="outline"
            size="sm"
            disabled
            title="No previous finding"
          >
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

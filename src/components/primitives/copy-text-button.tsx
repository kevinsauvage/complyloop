"use client";

import { Check, ClipboardList, Copy, Link2, Sparkles } from "lucide-react";

import { useCopy } from "@/components/primitives/use-copy";
import { Button } from "@/components/ui/button";

const ICONS = {
  ai: Sparkles,
  summary: ClipboardList,
  link: Link2,
  copy: Copy,
} as const;

/**
 * Copies prepared text — an AI prompt, a status summary, or a link — to the
 * clipboard. Plain clipboard text: nothing is sent anywhere from here.
 *
 * Pass `path` instead of `text` to copy an absolute URL for an in-app path;
 * it resolves against the browser origin at click time (there is no
 * configured public app URL to build it on the server).
 */
export function CopyTextButton({
  label,
  icon,
  description,
  iconOnly = false,
  size,
  ...source
}: {
  label: string;
  icon: keyof typeof ICONS;
  /** Extra context for screen readers, e.g. "12 requirements". */
  description?: string;
  /** Icon-only button; `label` (+ description) stays its accessible name. */
  iconOnly?: boolean;
  /** Icon-only size; defaults to `icon-sm` (32px). `icon-xs` (28px) for dense rows. */
  size?: "icon-sm" | "icon-xs";
} & ({ text: string; path?: never } | { path: string; text?: never })) {
  const text =
    source.path !== undefined
      ? typeof window === "undefined"
        ? source.path
        : new URL(source.path, window.location.origin).href
      : source.text;
  const { status, copied, copy } = useCopy(text);
  const announcement =
    status === "copied" ? "Copied" : status === "error" ? "Could not copy" : "";
  const Icon = copied ? Check : ICONS[icon];
  const accessibleName = description ? `${label}: ${description}` : label;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={iconOnly ? (size ?? "icon-sm") : "sm"}
        onClick={copy}
        aria-label={iconOnly || description ? accessibleName : undefined}
        title={iconOnly ? label : undefined}
      >
        <Icon data-icon="inline-start" aria-hidden />
        {iconOnly ? null : label}
      </Button>
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </>
  );
}

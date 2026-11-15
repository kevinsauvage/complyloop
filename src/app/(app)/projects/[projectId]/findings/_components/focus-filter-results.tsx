"use client";

import { useEffect } from "react";

/**
 * Focus island for the findings list. The filter form stores a flag in
 * sessionStorage when Apply is activated; after the server-rendered
 * navigation lands, focus moves to the results heading so keyboard and
 * screen-reader users continue from the result count instead of <body>.
 */
export function FocusFilterResults({ targetId }: { targetId: string }) {
  useEffect(() => {
    let flagged = false;
    try {
      flagged = sessionStorage.getItem("complyloop-focus-results") === "1";
      sessionStorage.removeItem("complyloop-focus-results");
    } catch {
      // Storage unavailable — leave focus where the browser put it.
    }
    if (!flagged) return;
    const target = document.getElementById(targetId);
    if (target instanceof HTMLElement) target.focus();
  }, [targetId]);

  return null;
}

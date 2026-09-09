"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Opens a `<details>` when the URL hash matches its id (e.g. `#dismiss-finding`). */
export function OpenDetailsOnHash({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function sync() {
      if (window.location.hash === `#${id}` && ref.current) {
        ref.current.open = true;
        // Move focus into the disclosed panel so keyboard and screen-reader
        // users land on the revealed content, not a redundant link.
        const field = ref.current.querySelector<HTMLElement>(
          "input, select, textarea, button",
        );
        (field ?? ref.current.querySelector<HTMLElement>("summary"))?.focus({
          preventScroll: true,
        });
      }
    }
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [id]);

  return (
    <details id={id} ref={ref}>
      {children}
    </details>
  );
}

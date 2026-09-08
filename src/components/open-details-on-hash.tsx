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

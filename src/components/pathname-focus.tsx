"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function PathnameFocus() {
  const pathname = usePathname();

  useEffect(() => {
    const main = document.getElementById("main-content");
    const heading = main?.querySelector("h1");
    if (heading instanceof HTMLElement) {
      heading.focus({ preventScroll: true });
    }
  }, [pathname]);

  return null;
}

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

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

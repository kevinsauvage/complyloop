"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/** Hides the global workspace strip on dashboard — switchers live in the hero instead. */
export function WorkspaceContextRouteGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/dashboard") return null;
  return children;
}

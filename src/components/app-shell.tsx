"use client";

import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { NavLinks } from "@/components/nav-links";

export function AppShell({
  workspaceContext,
  authControls,
  children,
}: {
  workspaceContext: ReactNode;
  /** Server-rendered auth UI — must not be imported into this client module. */
  authControls: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const navId = useId();

  useEffect(() => {
    const main = document.getElementById("main-content");
    const heading = main?.querySelector("h1");
    if (heading instanceof HTMLElement) {
      if (!heading.hasAttribute("tabindex")) {
        heading.tabIndex = -1;
      }
      heading.focus({ preventScroll: true });
    }
  }, [pathname]);

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-zinc-900 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to main content
      </a>
      <div className="flex min-h-screen flex-col md:flex-row">
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 md:hidden">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            ComplyLoop
          </Link>
          <button
            type="button"
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700"
            aria-expanded={navOpen}
            aria-controls={navId}
            onClick={() => setNavOpen((open) => !open)}
          >
            {navOpen ? "Close menu" : "Menu"}
          </button>
        </header>

        <aside
          id={navId}
          className={`${
            navOpen ? "flex" : "hidden"
          } w-full shrink-0 flex-col gap-8 border-b border-zinc-200 bg-white px-4 py-6 md:flex md:w-60 md:border-b-0 md:border-r`}
        >
          <div className="hidden px-3 md:block">
            <p className="text-lg font-semibold tracking-tight">ComplyLoop</p>
            <p className="text-xs text-zinc-500">
              Requirement → Fix → Verified → Evidence
            </p>
          </div>
          <nav aria-label="Main">
            <NavLinks onNavigate={() => setNavOpen(false)} />
          </nav>
          <div className="mt-auto flex flex-col gap-4">
            {authControls}
            <p className="px-3 text-xs text-zinc-500">
              MVP — RGAA / WCAG for React &amp; Next.js
            </p>
            <p className="px-3 text-xs text-zinc-500">
              <Link href="/legal/terms" className="hover:underline">
                Terms
              </Link>
              {" · "}
              <Link href="/legal/privacy" className="hover:underline">
                Privacy
              </Link>
            </p>
          </div>
        </aside>

        <main id="main-content" className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto max-w-5xl">
            {workspaceContext}
            {children}
          </div>
        </main>
      </div>
    </>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { NavLinks } from "@/components/nav-links";
import { ThemeToggle } from "@/components/theme-toggle";
import type { NavAttentionCounts } from "@/server/nav-attention";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

function BrandMark({ className }: { className?: string }) {
  return (
    <Link href="/dashboard" className={className}>
      <span className="flex items-center gap-2.5">
        <span className="relative flex size-7 shrink-0 items-center justify-center rounded-lg bg-signal shadow-[0_0_0_1px] shadow-signal/30">
          <span
            className="size-2 rounded-sm bg-signal-foreground/95"
            aria-hidden
          />
        </span>
        <span className="text-base font-semibold tracking-tight">
          ComplyLoop
        </span>
      </span>
      <span className="mt-1.5 block pl-[38px] text-xs leading-tight text-muted-foreground">
        <span aria-hidden>Requirement → Fix → Verified → Evidence</span>
        <span className="sr-only">
          Requirement to fix to verified to evidence
        </span>
      </span>
    </Link>
  );
}

function SidebarBody({
  authControls,
  navAttention,
  navLinks,
  showBrand = true,
}: {
  authControls: ReactNode;
  navAttention: NavAttentionCounts;
  /** Streaming nav slot — takes precedence over `navAttention` when set. */
  navLinks?: ReactNode;
  showBrand?: boolean;
}) {
  return (
    <div className="flex h-full flex-col gap-6">
      {showBrand ? <BrandMark className="px-3" /> : null}
      <nav aria-label="Main" className="flex-1">
        {navLinks ?? (
          <NavLinks navAttention={navAttention} />
        )}
      </nav>
      <div className="mt-auto space-y-3">
        <Separator />
        <div className="px-3">
          <ThemeToggle />
        </div>
        {authControls}
        <p className="px-3 text-xs leading-relaxed text-muted-foreground">
          RGAA / WCAG for React &amp; Next.js ·{" "}
          <Link
            href="/legal/terms"
            className="underline-offset-2 hover:text-foreground hover:underline"
          >
            Terms
          </Link>
          {" · "}
          <Link
            href="/legal/privacy"
            className="underline-offset-2 hover:text-foreground hover:underline"
          >
            Privacy
          </Link>
        </p>
      </div>
    </div>
  );
}

export function AppShell({
  workspaceContext,
  authControls,
  navAttention = { openFindings: 0, unreadAlerts: 0 },
  navLinks,
  children,
}: {
  workspaceContext: ReactNode;
  /** Server-rendered auth UI — must not be imported into this client module. */
  authControls: ReactNode;
  /** Sync counts for the non-streaming fallback path (tests, previews). */
  navAttention?: NavAttentionCounts;
  /** Streaming nav, e.g. `<Suspense><NavAttentionBadges /></Suspense>`. */
  navLinks?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);

  // Close nav when the route changes using setState-during-render (avoids effect).
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setNavOpen(false);
  }

  useEffect(() => {
    const main = document.getElementById("main-content");
    const heading = main?.querySelector("h1");
    if (heading instanceof HTMLElement) {
      heading.focus({ preventScroll: true });
    }
  }, [pathname]);

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <div className="flex min-h-screen flex-col md:flex-row">
        <header className="panel-frost sticky top-0 z-40 flex items-center justify-between border-b border-border bg-sidebar/70 px-4 py-3 md:hidden">
          <Link href="/dashboard" className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <span className="flex size-6 items-center justify-center rounded-md bg-signal">
              <span className="size-1.5 rounded-sm bg-signal-foreground/95" aria-hidden />
            </span>
            ComplyLoop
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle compact />
            <Sheet open={navOpen} onOpenChange={setNavOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={navOpen ? "Close menu" : "Menu"}
                >
                  <Menu />
                  Menu
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-72 bg-sidebar p-4"
                // The streaming nav slot is server-rendered and can't close
                // the sheet itself — close on any link click instead.
                // Keyboard-safe: Enter/Space on a link fires click.
                // (Custom component, so jsx-a11y doesn't flag the handler;
                // only link clicks close — toggles and empty space don't.)
                onClick={(event) => {
                  if (
                    event.target instanceof HTMLElement &&
                    event.target.closest("a")
                  ) {
                    setNavOpen(false);
                  }
                }}
              >
                <SheetHeader className="sr-only">
                  <SheetTitle>Main navigation</SheetTitle>
                </SheetHeader>
                <SidebarBody
                  authControls={authControls}
                  navAttention={navAttention}
                  navLinks={navLinks}
                />
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <aside className="panel-frost sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar/60 px-3 py-6 md:flex">
          <SidebarBody
            authControls={authControls}
            navAttention={navAttention}
            navLinks={navLinks}
          />
        </aside>

        <main
          id="main-content"
          className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8"
        >
          <div className="mx-auto max-w-7xl">
            {workspaceContext}
            {children}
          </div>
        </main>
      </div>
    </>
  );
}

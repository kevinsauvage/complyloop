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
    <Link href="/" className={className}>
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
      <span className="mt-1.5 block pl-[38px] text-[11px] leading-tight text-muted-foreground">
        Requirement → Fix → Verified → Evidence
      </span>
    </Link>
  );
}

function SidebarBody({
  authControls,
  navAttention,
  onNavigate,
  showBrand = true,
}: {
  authControls: ReactNode;
  navAttention: NavAttentionCounts;
  onNavigate?: () => void;
  showBrand?: boolean;
}) {
  return (
    <div className="flex h-full flex-col gap-6">
      {showBrand ? <BrandMark className="px-3" /> : null}
      <nav aria-label="Main" className="flex-1">
        <NavLinks navAttention={navAttention} onNavigate={onNavigate} />
      </nav>
      <div className="mt-auto space-y-3">
        <Separator />
        <div className="px-3">
          <ThemeToggle />
        </div>
        {authControls}
        <p className="px-3 text-[11px] leading-relaxed text-muted-foreground/80">
          MVP — RGAA / WCAG for React &amp; Next.js
        </p>
        <p className="px-3 text-[11px] text-muted-foreground/80">
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
  navAttention,
  children,
}: {
  workspaceContext: ReactNode;
  /** Server-rendered auth UI — must not be imported into this client module. */
  authControls: ReactNode;
  navAttention: NavAttentionCounts;
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
          <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <span className="flex size-6 items-center justify-center rounded-md bg-signal">
              <span className="size-1.5 rounded-sm bg-signal-foreground/95" aria-hidden />
            </span>
            ComplyLoop
          </Link>
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
            <SheetContent side="left" className="w-72 bg-sidebar p-4">
              <SheetHeader className="sr-only">
                <SheetTitle>Main navigation</SheetTitle>
              </SheetHeader>
              <SidebarBody
                authControls={authControls}
                navAttention={navAttention}
                onNavigate={() => setNavOpen(false)}
              />
            </SheetContent>
          </Sheet>
        </header>

        <aside className="panel-frost sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar/60 px-3 py-6 md:flex">
          <SidebarBody authControls={authControls} navAttention={navAttention} />
        </aside>

        <main
          id="main-content"
          className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-10"
        >
          <div className="mx-auto max-w-6xl">
            {workspaceContext}
            {children}
          </div>
        </main>
      </div>
    </>
  );
}

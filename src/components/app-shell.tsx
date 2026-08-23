"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { NavLinks } from "@/components/nav-links";
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
      <span className="flex items-center gap-2">
        <span
          className="size-2 shrink-0 rounded-full bg-signal shadow-[0_0_0_3px] shadow-signal/20"
          aria-hidden
        />
        <span className="text-lg font-semibold tracking-tight">ComplyLoop</span>
      </span>
      <span className="mt-1 block pl-4 text-xs text-muted-foreground">
        Requirement → Fix → Verified → Evidence
      </span>
    </Link>
  );
}

function SidebarBody({
  authControls,
  onNavigate,
  showBrand = true,
}: {
  authControls: ReactNode;
  onNavigate?: () => void;
  showBrand?: boolean;
}) {
  return (
    <div className="flex h-full flex-col gap-6">
      {showBrand ? <BrandMark className="px-3" /> : null}
      <nav aria-label="Main" className="flex-1">
        <NavLinks onNavigate={onNavigate} />
      </nav>
      <div className="mt-auto space-y-4">
        <Separator />
        {authControls}
        <p className="px-3 text-xs text-muted-foreground">
          MVP — RGAA / WCAG for React &amp; Next.js
        </p>
        <p className="px-3 text-xs text-muted-foreground">
          <Link href="/legal/terms" className="hover:text-foreground hover:underline">
            Terms
          </Link>
          {" · "}
          <Link
            href="/legal/privacy"
            className="hover:text-foreground hover:underline"
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
  children,
}: {
  workspaceContext: ReactNode;
  /** Server-rendered auth UI — must not be imported into this client module. */
  authControls: ReactNode;
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
        <header className="flex items-center justify-between border-b border-border bg-sidebar px-4 py-3 md:hidden">
          <Link href="/" className="text-lg font-semibold tracking-tight">
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
                onNavigate={() => setNavOpen(false)}
              />
            </SheetContent>
          </Sheet>
        </header>

        <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar/90 px-3 py-6 backdrop-blur-sm md:flex">
          <SidebarBody authControls={authControls} />
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

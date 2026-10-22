import Link from "next/link";
import type { ReactNode } from "react";

import { Separator } from "@/components/ui/separator";

import { MobileNavSheet } from "./mobile-nav-sheet";
import { NavLinks } from "./nav-links";
import { PathnameFocus } from "./pathname-focus";
import { ThemeToggle } from "./theme-toggle";

function BrandMark({ className }: { className?: string }) {
  return (
    <Link href="/projects" className={className}>
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
  workspaceSwitcher,
}: {
  authControls: ReactNode;
  workspaceSwitcher?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col gap-6">
      <BrandMark className="px-3" />
      {workspaceSwitcher ? (
        <div className="-mt-2 min-w-0">{workspaceSwitcher}</div>
      ) : null}
      <nav aria-label="Main" className="flex-1">
        <NavLinks />
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
  workspaceSwitcher,
  authControls,
  children,
}: {
  /** Active-organization label / switcher at the top of the sidebar. */
  workspaceSwitcher?: ReactNode;
  /** Server-rendered auth UI — passed as a slot, never imported. */
  authControls: ReactNode;
  children: ReactNode;
}) {
  const sidebar = (
    <SidebarBody
      authControls={authControls}
      workspaceSwitcher={workspaceSwitcher}
    />
  );

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <PathnameFocus />
      <div className="flex min-h-screen flex-col md:flex-row">
        <header className="panel-frost sticky top-0 z-40 flex items-center justify-between border-b border-border bg-sidebar/70 px-4 py-3 md:hidden">
          <Link
            href="/projects"
            className="flex items-center gap-2 text-base font-semibold tracking-tight"
          >
            <span className="flex size-6 items-center justify-center rounded-md bg-signal">
              <span
                className="size-1.5 rounded-sm bg-signal-foreground/95"
                aria-hidden
              />
            </span>
            ComplyLoop
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle compact />
            <MobileNavSheet>{sidebar}</MobileNavSheet>
          </div>
        </header>

        <aside className="panel-frost sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar/60 px-3 py-6 md:flex">
          {sidebar}
        </aside>

        <main
          id="main-content"
          className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8"
        >
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </>
  );
}

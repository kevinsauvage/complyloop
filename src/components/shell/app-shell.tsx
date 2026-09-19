import Link from "next/link";
import type { ReactNode } from "react";

import type { NavAttentionCounts } from "@complyloop/db/repo/nav-attention";

import { Separator } from "@/components/ui/separator";

import { MobileNavSheet } from "./mobile-nav-sheet";
import { NavLinks } from "./nav-links";
import { PathnameFocus } from "./pathname-focus";
import { ThemeToggle } from "./theme-toggle";

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
        {navLinks ?? <NavLinks navAttention={navAttention} />}
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
  /** Server-rendered auth UI — passed as a slot, never imported. */
  authControls: ReactNode;
  /** Sync counts for the non-streaming fallback path (tests, previews). */
  navAttention?: NavAttentionCounts;
  /** Streaming nav, e.g. `<Suspense><NavAttentionBadges /></Suspense>`. */
  navLinks?: ReactNode;
  children: ReactNode;
}) {
  const sidebar = (
    <SidebarBody
      authControls={authControls}
      navAttention={navAttention}
      navLinks={navLinks}
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
            href="/dashboard"
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
          <div className="mx-auto max-w-7xl">
            {workspaceContext}
            {children}
          </div>
        </main>
      </div>
    </>
  );
}

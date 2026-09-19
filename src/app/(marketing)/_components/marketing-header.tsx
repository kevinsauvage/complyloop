import Link from "next/link";

import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Button } from "@/components/ui/button";

const NAV_LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/#principles", label: "Principles" },
] as const;

function MarketingBrandLink({ className }: { className?: string }) {
  return (
    <Link href="/" className={className}>
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="relative flex size-8 shrink-0 items-center justify-center rounded-lg bg-signal shadow-[0_0_0_1px] shadow-signal/30">
          <span
            className="size-2.5 rounded-sm bg-signal-foreground/95"
            aria-hidden
          />
        </span>
        <span className="truncate text-lg font-semibold tracking-tight">
          ComplyLoop
        </span>
      </span>
    </Link>
  );
}

export function MarketingHeader({ isSignedIn }: { isSignedIn: boolean }) {
  return (
    <header className="panel-frost sticky top-0 z-40 border-b border-border/80">
      <div className="mx-auto flex h-16 max-w-6xl min-w-0 items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6">
        <MarketingBrandLink className="min-w-0 shrink" />

        <nav
          aria-label="Marketing"
          className="hidden shrink-0 items-center gap-1 md:flex"
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:bg-muted/60 hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle compact />
          {isSignedIn ? (
            <Button asChild size="sm">
              <Link href="/dashboard">Open dashboard</Link>
            </Button>
          ) : (
            <Button asChild size="sm">
              <Link href="/login">Sign in with GitHub</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

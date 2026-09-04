import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { MarketingBrandLink } from "@/components/marketing/marketing-shell";

const NAV_LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/#principles", label: "Principles" },
] as const;

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
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/login">Get started</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

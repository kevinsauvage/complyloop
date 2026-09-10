import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer className="border-t border-border/80 bg-card/30">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="text-sm font-medium text-foreground">ComplyLoop</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Compliance engineering for React and Next.js — from requirement to
            verified evidence.
          </p>
        </div>
        <div className="flex flex-col gap-4 text-sm text-muted-foreground sm:items-end">
          <p>RGAA / WCAG accessibility</p>
          <nav aria-label="Marketing" className="flex flex-wrap gap-x-4 gap-y-2 sm:justify-end">
            <Link
              href="/#how-it-works"
              className="py-2 underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              How it works
            </Link>
            <Link
              href="/#features"
              className="py-2 underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              Features
            </Link>
            <Link
              href="/#principles"
              className="py-2 underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              Principles
            </Link>
          </nav>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-2 sm:justify-end">
            <Link
              href="/legal/terms"
              className="py-2 underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              Terms
            </Link>
            <Link
              href="/legal/privacy"
              className="py-2 underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              Privacy
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}

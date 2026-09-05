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
        <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:items-end">
          <p>RGAA / WCAG accessibility</p>
          <p>
            <Link
              href="/legal/terms"
              className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              Terms
            </Link>
            {" · "}
            <Link
              href="/legal/privacy"
              className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              Privacy
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}

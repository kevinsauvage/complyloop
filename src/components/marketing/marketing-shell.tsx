import Link from "next/link";
import type { ReactNode } from "react";
import { auth, isGitHubAuthConfigured } from "@/auth";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

export async function MarketingShell({ children }: { children: ReactNode }) {
  const session = isGitHubAuthConfigured() ? await auth() : null;
  const isSignedIn = Boolean(session?.user);

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <div className="flex min-h-screen flex-col overflow-x-clip">
        <MarketingHeader isSignedIn={isSignedIn} />
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <MarketingFooter />
      </div>
    </>
  );
}

export function MarketingBrandLink({ className }: { className?: string }) {
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

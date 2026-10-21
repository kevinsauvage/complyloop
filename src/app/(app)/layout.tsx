import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";

import { isGitHubAuthConfigured } from "@/auth";
import { AppShell } from "@/components/shell/app-shell";
import { AuthControls } from "@/components/shell/auth-controls";
import {
  WorkspaceSwitcher,
  WorkspaceSwitcherSkeleton,
} from "@/components/shell/workspace-context";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getSession } from "@/server/auth-session";

// Authenticated workspace routes must never be indexed: robots.txt disallows
// are advisory and do not prevent indexing of linked URLs.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AppLayout({ children }: { children: ReactNode }) {
  const configured = isGitHubAuthConfigured();
  const session = configured ? await getSession() : null;
  const signedInUser = session?.user
    ? {
        image: session.user.image ?? null,
        label:
          session.user.login ??
          session.user.name ??
          session.user.email ??
          "Signed in",
      }
    : null;

  return (
    <TooltipProvider>
      <AppShell
        workspaceSwitcher={
          <Suspense fallback={<WorkspaceSwitcherSkeleton />}>
            <WorkspaceSwitcher />
          </Suspense>
        }
        authControls={
          <AuthControls configured={configured} user={signedInUser} />
        }
      >
        {children}
      </AppShell>
      <Toaster />
    </TooltipProvider>
  );
}

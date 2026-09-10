import type { ReactNode } from "react";
import { Suspense } from "react";

import { isGitHubAuthConfigured } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { AuthControls } from "@/components/auth-controls";
import {
  NavAttentionBadges,
  NavBadgeSkeletons,
} from "@/components/nav-attention-badges";
import { WorkspaceContext } from "@/components/workspace-context";
import { getSession } from "@/server/auth-session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Badge counts stream via <NavAttentionBadges> below — the shell and route
  // content render without awaiting the counts query.
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
    <AppShell
      workspaceContext={<WorkspaceContext />}
      authControls={
        <AuthControls configured={configured} user={signedInUser} />
      }
      navLinks={
        <Suspense fallback={<NavBadgeSkeletons />}>
          <NavAttentionBadges />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}

import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { AuthControls } from "@/components/auth-controls";
import { WorkspaceContext } from "@/components/workspace-context";
import { auth, isGitHubAuthConfigured } from "@/auth";
import { navAttentionForProject } from "@/server/nav-attention";
import { getWorkspace } from "@/server/workspace";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { project } = await getWorkspace();
  const navAttention = project
    ? await navAttentionForProject(project)
    : { openFindings: 0, unreadAlerts: 0 };

  const configured = isGitHubAuthConfigured();
  const session = configured ? await auth() : null;
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
      navAttention={navAttention}
    >
      {children}
    </AppShell>
  );
}

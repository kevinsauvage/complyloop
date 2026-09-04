import { AppShell } from "@/components/app-shell";
import { AuthControls } from "@/components/auth-controls";
import { WorkspaceContext } from "@/components/workspace-context";
import { navAttentionCounts } from "@/server/nav-attention";
import { getWorkspace } from "@/server/workspace";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { db, project } = await getWorkspace();
  const navAttention = project
    ? navAttentionCounts(db, project.id)
    : { openFindings: 0, unreadAlerts: 0 };

  return (
    <AppShell
      workspaceContext={<WorkspaceContext />}
      authControls={<AuthControls />}
      navAttention={navAttention}
    >
      {children}
    </AppShell>
  );
}

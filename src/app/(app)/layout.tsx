import { AppShell } from "@/components/app-shell";
import { AuthControls } from "@/components/auth-controls";
import { WorkspaceContext } from "@/components/workspace-context";
import { WorkspaceContextRouteGate } from "@/components/workspace-context-route-gate";
import { navAttentionForProject } from "@/server/nav-attention";
import { getWorkspace } from "@/server/workspace";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { project } = await getWorkspace();
  const navAttention = project
    ? await navAttentionForProject(project)
    : { openFindings: 0, unreadAlerts: 0 };

  return (
    <AppShell
      workspaceContext={
        <WorkspaceContextRouteGate>
          <WorkspaceContext />
        </WorkspaceContextRouteGate>
      }
      authControls={<AuthControls />}
      navAttention={navAttention}
    >
      {children}
    </AppShell>
  );
}

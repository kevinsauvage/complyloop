import { getGitHubAccessToken, isGitHubAuthConfigured } from "@/auth";
import { getSession } from "@/server/auth-session";
import { ConnectProjectDialog } from "@/components/connect-project-dialog";
import { GitHubRepoPicker } from "@/components/github-repo-picker";
import { PermissionNotice } from "@/components/permission-notice";
import { SignInWithGitHubButton } from "@/components/sign-in-with-github-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/page-primitives";
import type { ReactNode } from "react";
import { publicErrorMessage } from "@/server/action-state";
import { connectedGitHubProjectsByFullName } from "@/server/connect-github";
import { listGitHubRepos } from "@/server/github-access";
import { githubAppInstallUrl } from "@/server/github-app";
import { projectCapabilities } from "@/server/project-capabilities";
import { getWorkspace } from "@/server/workspace";

export async function ConnectProjectPanel({
  defaultOpen = true,
  triggerLabel = "Connect repository (creates project)",
}: {
  /** When false, connect UI opens in a dialog. */
  defaultOpen?: boolean;
  /** Dialog trigger label when `defaultOpen` is false. */
  triggerLabel?: string;
}) {
  const configured = isGitHubAuthConfigured();
  const session = configured ? await getSession() : null;
  const signedIn = Boolean(session?.user);
  const userId = session?.user?.id ?? null;
  const workspace = await getWorkspace();
  const caps = projectCapabilities(
    workspace.project,
    workspace.access,
    workspace.activeOrgId,
  );

  let repos: Awaited<ReturnType<typeof listGitHubRepos>> = [];
  let listError: string | null = null;
  const connectedByFullName: Record<string, string> = {};

  if (configured && signedIn && userId && caps.canConnect) {
    const { projects, activeOrgId } = workspace;
    Object.assign(
      connectedByFullName,
      connectedGitHubProjectsByFullName(projects, activeOrgId),
    );

    // Compact dialog mode: skip the eager fetch — the picker loads page 1
    // from /api/github/repos when the dialog actually opens (fetchOnMount).
    if (defaultOpen) {
      try {
        const token = await getGitHubAccessToken();
        if (!token) {
          listError =
            "Could not read your GitHub token. Sign out and sign in again.";
        } else {
          repos = await listGitHubRepos({ accessToken: token, perPage: 30 });
        }
      } catch (error) {
        listError = publicErrorMessage(error);
      }
    }
  }

  if (!caps.canConnect) {
    // Compact header mode: stay quiet — viewers already cannot connect.
    if (!defaultOpen) return null;
    return (
      <PermissionNotice>
        Connecting repositories requires an admin or owner role in the active
        organization.
      </PermissionNotice>
    );
  }

  const body = (
    <div className="space-y-4">
      <div className="rounded-lg border border-signal/20 bg-signal/5 px-3 py-2.5 text-sm text-muted-foreground">
        Connect a GitHub repository to run assessments, track findings, and
        build an evidence trail for this organization. Connecting creates a
        project — a project is a connected repository.
      </div>
      {!configured ? (
        <Alert className="border-border/60 bg-muted/40">
          <AlertDescription>
            Add <code className="font-mono text-xs">AUTH_SECRET</code>,{" "}
            <code className="font-mono text-xs">AUTH_GITHUB_ID</code>, and{" "}
            <code className="font-mono text-xs">AUTH_GITHUB_SECRET</code> to
            enable Sign in with GitHub and the repository picker. See{" "}
            <code className="font-mono text-xs">.env.example</code>.
          </AlertDescription>
        </Alert>
      ) : !signedIn ? (
        <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-5">
          <p className="text-sm text-muted-foreground">
            Sign in with GitHub to browse your repositories and connect one in a
            click.
          </p>
          <SignInWithGitHubButton />
        </div>
      ) : listError ? (
        <Alert variant="destructive">
          <AlertDescription>{listError}</AlertDescription>
        </Alert>
      ) : (
        <GitHubRepoPicker
          initialRepos={repos}
          connectedByFullName={connectedByFullName}
          appInstallUrl={githubAppInstallUrl()}
          fetchOnMount={!defaultOpen}
        />
      )}
    </div>
  );

  if (defaultOpen) {
    return body;
  }

  return (
    <ConnectProjectDialog triggerLabel={triggerLabel}>
      {body}
    </ConnectProjectDialog>
  );
}

/**
 * Project variant of the `EmptyState` pattern (icon + title + description +
 * content): the picker body renders as the card footer instead of a single
 * centered action.
 */
export function ConnectProjectCard({ children }: { children: ReactNode }) {
  return (
    <EmptyState title="Connect a repository" footer={children}>
      <div className="flex flex-col gap-3 text-left">
        <p>
          Connecting creates a project — link a GitHub repository to assess
          against RGAA/WCAG.
        </p>
        <ol className="flex flex-col gap-1.5 text-sm">
          <li className="flex gap-2">
            <span aria-hidden className="font-semibold text-signal">
              1.
            </span>
            Connect a repository — it becomes your project
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="font-semibold text-signal">
              2.
            </span>
            Run your first assessment from the dashboard
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="font-semibold text-signal">
              3.
            </span>
            Fix findings to Verified — every step is kept as evidence
          </li>
        </ol>
      </div>
    </EmptyState>
  );
}

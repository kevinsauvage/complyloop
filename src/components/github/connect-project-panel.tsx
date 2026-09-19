import type { ReactNode } from "react";

import { isGitHubAuthConfigured } from "@/auth";
import { EmptyState } from "@/components/primitives/page-primitives";
import { PermissionNotice } from "@/components/primitives/permission-notice";
import { SignInWithGitHubButton } from "@/components/shell/sign-in-with-github-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { publicErrorMessage } from "@/server/action-state";
import { getSession } from "@/server/auth-session";
import { getGitHubAccessTokenState } from "@/server/github/access-token";
import {
  classifyConnectFailure,
  type ConnectFailureCause,
} from "@/server/github/connect-failure";
import {
  githubAppInstallUrl,
  listAvailableRepos,
} from "@/server/github/github-connector";
import { connectedGitHubProjectsByFullName } from "@/server/workspace/connect-github";
import { projectCapabilities } from "@/server/workspace/project-capabilities";
import { getWorkspace } from "@/server/workspace/workspace";

import { ConnectProjectDialog } from "./connect-project-dialog";
import { GitHubRepoPicker } from "./github-repo-picker";

/**
 * Classified repair banner: every known GitHub failure mode gets a repair
 * path (install URL / reconnect / rename hint) instead of a generic error.
 */
function ConnectFailureRepair({
  message,
  cause,
  appInstallUrl,
}: {
  message: string;
  cause: ConnectFailureCause;
  appInstallUrl?: string;
}) {
  if (cause === "unknown") {
    return (
      <Alert variant="destructive">
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    );
  }
  const repair =
    cause === "no-installation" || cause === "repo-not-on-install" ? (
      appInstallUrl ? (
        <a
          href={appInstallUrl}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-foreground underline underline-offset-2"
        >
          Install the GitHub App on the target repositories, then refresh.
        </a>
      ) : (
        <span>
          Set <code className="font-mono text-xs">GITHUB_APP_SLUG</code> to show
          an install link (see{" "}
          <code className="font-mono text-xs">.env.example</code>).
        </span>
      )
    ) : cause === "token-revoked" || cause === "token-missing" ? (
      <span>Sign out and sign in again to reconnect your GitHub account.</span>
    ) : (
      <span>
        The repository may have been renamed, transferred, or deleted — check
        the name, or disconnect and connect it again.
      </span>
    );
  return (
    <Alert variant="destructive">
      <AlertDescription className="flex flex-col gap-1.5">
        <span>{message}</span>
        <span className="text-foreground">{repair}</span>
      </AlertDescription>
    </Alert>
  );
}

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
  const [session, workspace] = await Promise.all([
    configured ? getSession() : null,
    getWorkspace(),
  ]);
  const signedIn = Boolean(session?.user);
  const userId = session?.user?.id ?? null;
  const caps = projectCapabilities(
    workspace.project,
    workspace.access,
    workspace.activeOrgId,
  );

  let repos: Awaited<ReturnType<typeof listAvailableRepos>> = [];
  let listError: { message: string; cause: ConnectFailureCause } | null = null;
  const connectedByFullName: Record<string, string> = {};
  const appInstallUrl = githubAppInstallUrl();

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
        const tokenState = await getGitHubAccessTokenState();
        if (tokenState.state === "revoked") {
          listError = {
            message:
              "GitHub revoked this app's authorization. Sign out and sign in again to reconnect.",
            cause: "token-revoked",
          };
        } else if (tokenState.state !== "valid") {
          listError = {
            message:
              "Could not read your GitHub token. Sign out and sign in again.",
            cause: "token-missing",
          };
        } else {
          repos = await listAvailableRepos({
            accessToken: tokenState.token,
            perPage: 30,
          });
        }
      } catch (error) {
        listError = {
          message: publicErrorMessage(error),
          cause: classifyConnectFailure(error),
        };
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
        <ConnectFailureRepair
          message={listError.message}
          cause={listError.cause}
          appInstallUrl={appInstallUrl}
        />
      ) : (
        <GitHubRepoPicker
          initialRepos={repos}
          connectedByFullName={connectedByFullName}
          appInstallUrl={appInstallUrl}
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

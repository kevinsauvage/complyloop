import {
  auth,
  getGitHubAccessToken,
  isGitHubAuthConfigured,
} from "@/auth";
import { ConnectProjectForm } from "@/components/connect-project-form";
import { ConnectProjectDialog } from "@/components/connect-project-dialog";
import { GitHubRepoPicker } from "@/components/github-repo-picker";
import { PermissionNotice } from "@/components/permission-notice";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { signInWithGitHubAction } from "@/server/actions/auth";
import {
  connectedGitHubProjectsByFullName,
} from "@/server/connect-github";
import { isLocalProjectConnectAllowed } from "@/server/connect-policy";
import { listGitHubRepos } from "@/server/github";
import { isGitHubAppConfigured } from "@/server/github-app";
import { projectCapabilities } from "@/server/project-capabilities";
import { getWorkspace } from "@/server/workspace";
import { ChevronDown } from "lucide-react";

export async function ConnectProjectPanel({
  defaultOpen = true,
}: {
  /** When false, advanced connect UI starts collapsed. */
  defaultOpen?: boolean;
}) {
  const configured = isGitHubAuthConfigured();
  const session = configured ? await auth() : null;
  const signedIn = Boolean(session?.user);
  const userId = session?.user?.id ?? null;
  const localPathAllowed = isLocalProjectConnectAllowed();
  const workspace = await getWorkspace();
  const caps = projectCapabilities(workspace.project, workspace.access);

  let repos: Awaited<ReturnType<typeof listGitHubRepos>> = [];
  let listError: string | null = null;
  const connectedByFullName: Record<string, string> = {};

  if (configured && signedIn && userId && caps.canConnect) {
    const { db, activeOrgId } = workspace;
    Object.assign(
      connectedByFullName,
      connectedGitHubProjectsByFullName(db.projects, userId, activeOrgId),
    );

    const token = await getGitHubAccessToken();
    if (!token) {
      listError =
        "Could not read your GitHub token. Sign out and sign in again.";
    } else {
      try {
        repos = await listGitHubRepos({ accessToken: token, perPage: 50 });
      } catch (error) {
        listError =
          error instanceof Error
            ? error.message
            : "Failed to list GitHub repositories.";
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
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-sm font-medium">Connect from GitHub</h3>
        {!configured ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Add <code className="font-mono text-xs">AUTH_SECRET</code>,{" "}
            <code className="font-mono text-xs">AUTH_GITHUB_ID</code>, and{" "}
            <code className="font-mono text-xs">AUTH_GITHUB_SECRET</code> to
            enable Sign in with GitHub and repository picker. See{" "}
            <code className="font-mono text-xs">.env.example</code>.
          </p>
        ) : !signedIn ? (
          <div className="mt-3 flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Sign in with GitHub to browse your repositories and connect one in
              a click.
            </p>
            <form action={signInWithGitHubAction}>
              <Button type="submit">Sign in with GitHub</Button>
            </form>
          </div>
        ) : listError ? (
          <Alert variant="destructive" className="mt-2">
            <AlertDescription>{listError}</AlertDescription>
          </Alert>
        ) : (
          <div className="mt-3">
            <GitHubRepoPicker
              repos={repos}
              connectedByFullName={connectedByFullName}
              usesGitHubApp={isGitHubAppConfigured()}
            />
          </div>
        )}
      </div>

      {localPathAllowed || signedIn ? (
        <>
          <Separator />
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1 px-0">
                <ChevronDown className="size-4" />
                {localPathAllowed
                  ? "Advanced: local path or git URL"
                  : "Advanced: git URL"}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              {!signedIn && !localPathAllowed ? (
                <p className="text-sm text-muted-foreground">
                  Sign in to connect a repository by URL.
                </p>
              ) : (
                <ConnectProjectForm localPathAllowed={localPathAllowed} />
              )}
            </CollapsibleContent>
          </Collapsible>
        </>
      ) : null}
    </div>
  );

  if (defaultOpen) {
    return body;
  }

  return <ConnectProjectDialog>{body}</ConnectProjectDialog>;
}

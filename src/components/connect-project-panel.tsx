import {
  auth,
  getGitHubAccessToken,
  isGitHubAuthConfigured,
  signIn,
} from "@/auth";
import { ConnectProjectForm } from "@/components/connect-project-form";
import { GitHubRepoPicker } from "@/components/github-repo-picker";
import { isLocalProjectConnectAllowed } from "@/server/connect-policy";
import { listGitHubRepos } from "@/server/github";
import { getWorkspace } from "@/server/workspace";

export async function ConnectProjectPanel() {
  const configured = isGitHubAuthConfigured();
  const session = configured ? await auth() : null;
  const signedIn = Boolean(session?.user);
  const userId = session?.user?.id ?? null;
  const localPathAllowed = isLocalProjectConnectAllowed();

  let repos: Awaited<ReturnType<typeof listGitHubRepos>> = [];
  let listError: string | null = null;
  const connectedByFullName: Record<string, string> = {};

  if (configured && signedIn && userId) {
    const { db } = await getWorkspace();
    for (const project of db.projects) {
      if (
        project.source === "github" &&
        project.ownerUserId === userId &&
        project.github?.fullName
      ) {
        connectedByFullName[project.github.fullName] = project.id;
      }
    }

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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-sm font-medium text-zinc-900">
          Connect from GitHub
        </h3>
        {!configured ? (
          <p className="mt-2 text-sm text-zinc-500">
            Add <code className="font-mono text-xs">AUTH_SECRET</code>,{" "}
            <code className="font-mono text-xs">AUTH_GITHUB_ID</code>, and{" "}
            <code className="font-mono text-xs">AUTH_GITHUB_SECRET</code> to
            enable Sign in with GitHub and repository picker. See{" "}
            <code className="font-mono text-xs">.env.example</code>.
          </p>
        ) : !signedIn ? (
          <div className="mt-3 flex flex-col gap-3">
            <p className="text-sm text-zinc-600">
              Sign in with GitHub to browse your repositories and connect one in
              a click.
            </p>
            <form
              action={async () => {
                "use server";
                await signIn("github", { redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
              >
                Sign in with GitHub
              </button>
            </form>
          </div>
        ) : listError ? (
          <p className="mt-2 text-sm text-red-700" role="alert">
            {listError}
          </p>
        ) : (
          <div className="mt-3">
            <GitHubRepoPicker
              repos={repos}
              connectedByFullName={connectedByFullName}
            />
          </div>
        )}
      </div>

      {localPathAllowed || signedIn ? (
        <details className="border-t border-zinc-100 pt-4">
          <summary className="cursor-pointer text-sm font-medium text-zinc-700">
            {localPathAllowed
              ? "Advanced: local path or git URL"
              : "Advanced: git URL"}
          </summary>
          <div className="mt-3">
            {!signedIn && !localPathAllowed ? (
              <p className="text-sm text-zinc-600">
                Sign in to connect a repository by URL.
              </p>
            ) : (
              <ConnectProjectForm localPathAllowed={localPathAllowed} />
            )}
          </div>
        </details>
      ) : null}
    </div>
  );
}

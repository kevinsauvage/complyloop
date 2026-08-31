import { auth, getGitHubAccessToken } from "@/auth";
import { parsePageParam } from "@/core/pagination";
import { listGitHubRepos } from "@/server/github";
import { projectCapabilities } from "@/server/project-capabilities";
import { publicErrorMessage } from "@/server/action-state";
import { getWorkspace } from "@/server/workspace";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  const workspace = await getWorkspace();
  const caps = projectCapabilities(
    workspace.project,
    workspace.access,
    workspace.activeOrgId,
  );
  if (!caps.canConnect) {
    return Response.json({ error: "Not allowed to connect repos." }, { status: 403 });
  }

  const token = await getGitHubAccessToken();
  if (!token) {
    return Response.json(
      { error: "Could not read your GitHub token. Sign out and sign in again." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() || undefined;
  const page = parsePageParam(url.searchParams.get("page") ?? undefined);
  const perPage = 30;

  try {
    const repos = await listGitHubRepos({
      accessToken: token,
      page,
      perPage,
      q,
    });
    return Response.json({
      repos,
      page,
      hasMore: repos.length >= perPage,
    });
  } catch (error) {
    return Response.json(
      { error: publicErrorMessage(error) },
      { status: 502 },
    );
  }
}

import { auth, getGitHubAccessToken } from "@/auth";
import { z } from "zod";
import { listGitHubRepos } from "@/server/github-access";
import { projectCapabilities } from "@/server/project-capabilities";
import { publicErrorMessage } from "@/server/action-state";
import { parseInput } from "@/server/boundary";
import { getWorkspace } from "@/server/workspace";

export const dynamic = "force-dynamic";

const githubReposQuerySchema = z.object({
  q: z
    .string()
    .max(256)
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed && trimmed.length > 0 ? trimmed : undefined;
    }),
});

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
  let query: z.infer<typeof githubReposQuerySchema>;
  try {
    query = parseInput(
      githubReposQuerySchema,
      {
        q: url.searchParams.get("q") ?? undefined,
      },
      "Invalid repository search.",
    );
  } catch (error) {
    return Response.json({ error: publicErrorMessage(error) }, { status: 400 });
  }
  const perPage = 30;

  try {
    const repos = await listGitHubRepos({
      accessToken: token,
      perPage,
      q: query.q,
    });
    return Response.json({
      repos,
      hasMore: repos.length >= perPage,
    });
  } catch (error) {
    return Response.json(
      { error: publicErrorMessage(error) },
      { status: 502 },
    );
  }
}

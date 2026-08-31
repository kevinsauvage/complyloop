import { isProjectVisible } from "@/server/project-visibility";
import { recentAssessmentJobsForProject } from "@/server/assessment-jobs";
import { getWorkspace } from "@/server/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  const { projectId } = await params;
  const workspace = await getWorkspace();
  const project = workspace.db.projects.find((candidate) => candidate.id === projectId);
  if (!project || !isProjectVisible(project, workspace.access)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const jobs = await recentAssessmentJobsForProject(projectId);
  return Response.json({ jobs });
}

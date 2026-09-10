import { z } from "zod";
import { entityIdSchema, parseInput } from "@/core/filters";
import { isProjectVisible } from "@/server/project-visibility";
import { recentAssessmentJobsForProject } from "@/server/assessment-jobs";
import { getWorkspace } from "@/server/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const assessmentJobsParamsSchema = z.object({
  projectId: entityIdSchema,
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  const rawParams = await params;
  let projectId: string;
  try {
    projectId = parseInput(assessmentJobsParamsSchema, rawParams).projectId;
  } catch {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  const workspace = await getWorkspace();
  const project = workspace.projects.find((candidate) => candidate.id === projectId);
  if (!project || !isProjectVisible(project, workspace.access)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const jobs = await recentAssessmentJobsForProject(projectId);
  return Response.json({ jobs });
}

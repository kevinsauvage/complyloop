import { z } from "zod";

import { entityIdSchema, parseInput } from "@/core/actions/validate";
import { recentAssessmentJobsForProject } from "@/server/assessment/assessment-jobs";
import { viewerCanViewProject } from "@/server/workspace/workspace";

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
  // Polled every few seconds while a job is active: authorize with a single
  // project row instead of the full workspace tenancy load.
  if (!(await viewerCanViewProject(projectId))) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const jobs = await recentAssessmentJobsForProject(projectId);
  return Response.json({ jobs });
}

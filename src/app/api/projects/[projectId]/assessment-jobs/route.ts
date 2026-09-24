import { z } from "zod";

import { entityIdSchema, parseInput } from "@/core/actions/validate";
import { recentAssessmentJobsForProject } from "@/server/assessment/assessment-jobs";
import { getSession } from "@/server/auth-session";
import { assertJobPollRateLimit } from "@/server/rate-limit";
import { viewerCanViewProject } from "@/server/workspace/workspace";

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

  // Polled every few seconds: throttle per user so a tight loop cannot hammer
  // the DB.
  const userId = (await getSession())?.user?.id;
  if (userId) {
    try {
      await assertJobPollRateLimit(userId);
    } catch {
      return Response.json(
        { error: "Too many requests. Try again shortly." },
        { status: 429 },
      );
    }
  }

  const jobs = await recentAssessmentJobsForProject(projectId);
  return Response.json({ jobs });
}

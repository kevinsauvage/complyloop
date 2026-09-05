import type { Project } from "@complyloop/domain/project-types";
import { getDrizzle } from "@complyloop/db/client";
import { listAllEvidenceForProject } from "@complyloop/db/postgres-queries";
import { parseReportViewParam, type ReportView } from "@/core/report-view";
import { getWorkspace } from "./workspace";
import { reportInputForProject, type ReportInput } from "./report";

export type ReportRequestContext =
  | { ok: false; response: Response }
  | { ok: true; project: Project; view: ReportView; input: ReportInput };

/** Loads workspace, evidence, and report input for markdown/HTML export routes. */
export async function loadReportRequestContext(
  request: Request,
): Promise<ReportRequestContext> {
  const { db, project } = await getWorkspace();
  if (!project) {
    return {
      ok: false,
      response: new Response("No project connected.", { status: 404 }),
    };
  }

  const view = parseReportViewParam(
    new URL(request.url).searchParams.get("view"),
  );
  const evidence = await listAllEvidenceForProject(
    await getDrizzle(),
    project.id,
  );

  return {
    ok: true,
    project,
    view,
    input: reportInputForProject({ ...db, evidence }, project),
  };
}

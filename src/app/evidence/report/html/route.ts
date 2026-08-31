import {
  buildAuditReportHtml,
  buildEngineeringReportHtml,
} from "@/server/report-html";
import { getDrizzle } from "@/server/db-store/client";
import { listAllEvidenceForProject } from "@/server/db-store/postgres-queries";
import { reportInputForProject } from "@/server/report";
import { parseReportViewParam } from "@/core/report-view";
import { getWorkspace } from "@/server/workspace";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const { db, project } = await getWorkspace();
  if (!project) {
    return new Response("No project connected.", { status: 404 });
  }
  const view = parseReportViewParam(new URL(request.url).searchParams.get("view"));
  const evidence = await listAllEvidenceForProject(
    await getDrizzle(),
    project.id,
  );
  const input = reportInputForProject({ ...db, evidence }, project);
  const html =
    view === "engineering"
      ? buildEngineeringReportHtml(input)
      : buildAuditReportHtml(input);

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

import { buildComplianceReportHtml } from "@/server/report-html";
import { reportInputForProject } from "@/server/report";
import { getWorkspace } from "@/server/workspace";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const { db, project } = await getWorkspace();
  if (!project) {
    return new Response("No project connected.", { status: 404 });
  }
  const input = reportInputForProject(db, project);

  return new Response(buildComplianceReportHtml(input), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

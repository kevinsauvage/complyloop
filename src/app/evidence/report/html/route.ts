import {
  buildComplianceReportHtml,
  buildComplianceReportMarkdown,
  reportInputForProject,
} from "@/server/report";
import { getWorkspace } from "@/server/workspace";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const { db, project } = await getWorkspace();
  if (!project) {
    return new Response("No project connected.", { status: 404 });
  }
  const markdown = buildComplianceReportMarkdown(
    reportInputForProject(db, project),
  );

  return new Response(buildComplianceReportHtml(markdown, project.name), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

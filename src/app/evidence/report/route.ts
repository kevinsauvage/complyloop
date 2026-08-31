import { sanitizeDownloadFilename } from "@/server/download-filename";
import { getDrizzle } from "@/server/db-store/client";
import { listAllEvidenceForProject } from "@/server/db-store/postgres-queries";
import {
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
  const evidence = await listAllEvidenceForProject(
    await getDrizzle(),
    project.id,
  );
  const markdown = buildComplianceReportMarkdown(
    reportInputForProject({ ...db, evidence }, project),
  );

  const safeName = sanitizeDownloadFilename(project.name, "project");
  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="compliance-report-${safeName}.md"`,
    },
  });
}

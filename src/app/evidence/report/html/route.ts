import { buildComplianceReportHtml } from "@/server/report-html";
import { getDrizzle } from "@/server/db-store/client";
import { listAllEvidenceForProject } from "@/server/db-store/postgres-queries";
import { reportInputForProject } from "@/server/report";
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
  const input = reportInputForProject({ ...db, evidence }, project);

  return new Response(buildComplianceReportHtml(input), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

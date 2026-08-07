import {
  evidenceForProject,
  findingsForProject,
  requirementsForProject,
} from "@/server/project-visibility";
import { buildComplianceReportMarkdown } from "@/server/report";
import { getWorkspace } from "@/server/workspace";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const { db, project } = await getWorkspace();
  if (!project) {
    return new Response("No project connected.", { status: 404 });
  }
  const projectFindings = findingsForProject(db.findings, project.id);
  const markdown = buildComplianceReportMarkdown({
    project,
    framework: db.frameworks[0],
    controls: db.controls,
    requirements: requirementsForProject(db.requirements, project.id),
    findings: projectFindings,
    remediations: db.remediations.filter((remediation) =>
      projectFindings.some(
        (finding) => finding.id === remediation.findingId,
      ),
    ),
    evidence: evidenceForProject(db.evidence, project.id),
    exportedAt: new Date().toISOString(),
  });

  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="compliance-report-${project.name}.md"`,
    },
  });
}

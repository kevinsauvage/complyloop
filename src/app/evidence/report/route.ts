import { buildComplianceReportMarkdown } from "@/server/report";
import { getWorkspace } from "@/server/workspace";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const { db, project } = await getWorkspace();
  const markdown = buildComplianceReportMarkdown({
    project,
    framework: db.frameworks[0],
    controls: db.controls,
    requirements: db.requirements.filter(
      (requirement) => requirement.projectId === project.id,
    ),
    findings: db.findings.filter((finding) => finding.projectId === project.id),
    remediations: db.remediations.filter((remediation) =>
      db.findings.some(
        (finding) =>
          finding.id === remediation.findingId &&
          finding.projectId === project.id,
      ),
    ),
    evidence: db.evidence,
    exportedAt: new Date().toISOString(),
  });

  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="compliance-report-${project.name}.md"`,
    },
  });
}

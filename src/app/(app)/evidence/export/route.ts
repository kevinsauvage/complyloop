import { loadEvidenceExport } from "@/server/evidence-queries";
import {
  controlsInScope,
  requirementsInScope,
} from "@/server/project-scope";
import { frameworkForProject } from "@/server/report";
import { getWorkspace } from "@/server/workspace";

export async function GET(): Promise<Response> {
  const { project } = await getWorkspace();
  if (!project) {
    return new Response("No project connected.", { status: 404 });
  }
  const { exported, requirements } = await loadEvidenceExport(project.id);
  const payload = {
    exportedAt: new Date().toISOString(),
    project: { name: project.name, connectedAt: project.createdAt },
    framework: frameworkForProject(project),
    controls: controlsInScope(project),
    requirements: requirementsInScope(requirements, project),
    evidence: exported.records,
    evidenceTotal: exported.total,
    evidenceLimit: exported.limit,
    truncated: exported.truncated,
  };
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="evidence.json"',
    },
  });
}

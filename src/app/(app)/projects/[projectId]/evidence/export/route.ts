// Colocated with the evidence page on purpose: this download endpoint serves
// that page's export menu (route handlers don't inherit layouts, so the (app)
// group here is organizational only).
import { assertExportRateLimit, RateLimitError } from "@/server/rate-limit";
import { loadEvidenceExport } from "@/server/reporting/evidence-queries";
import { frameworkForProject } from "@/server/reporting/report";
import {
  controlsInScope,
  requirementsInScope,
} from "@/server/workspace/project-scope";
import {
  getWorkspace,
  requireProjectAccess,
} from "@/server/workspace/workspace";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  const { projectId } = await params;
  const { userId } = await getWorkspace();
  const project = await requireProjectAccess(projectId, "project.view").catch(
    () => null,
  );
  if (!project) {
    return new Response("No project connected.", { status: 404 });
  }
  if (userId) {
    try {
      await assertExportRateLimit(userId);
    } catch (error) {
      if (!(error instanceof RateLimitError)) throw error;
      return new Response("Too many export requests. Try again shortly.", {
        status: 429,
      });
    }
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

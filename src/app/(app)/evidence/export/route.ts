import { getDrizzle } from "@complyloop/db/client";
import { listEvidenceForExport } from "@complyloop/db/repo/evidence";
import {
  controlsInScope,
  requirementsInScope,
} from "@/server/assessment-status";
import { frameworkForProject } from "@/server/report";
import { getWorkspace } from "@/server/workspace";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const { db, project } = await getWorkspace();
  if (!project) {
    return new Response("No project connected.", { status: 404 });
  }
  const exported = await listEvidenceForExport(await getDrizzle(), project.id);
  const payload = {
    exportedAt: new Date().toISOString(),
    project: { name: project.name, connectedAt: project.createdAt },
    framework: frameworkForProject(db, project),
    controls: controlsInScope(project),
    requirements: requirementsInScope(db.requirements, project),
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

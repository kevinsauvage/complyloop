import {
  evidenceForProject,
  requirementsForProject,
} from "@/server/project-visibility";
import { getWorkspace } from "@/server/workspace";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const { db, project } = await getWorkspace();
  if (!project) {
    return new Response("No project connected.", { status: 404 });
  }
  const payload = {
    exportedAt: new Date().toISOString(),
    project: { name: project.name, connectedAt: project.createdAt },
    framework: db.frameworks[0],
    controls: db.controls,
    requirements: requirementsForProject(db.requirements, project.id),
    evidence: evidenceForProject(db.evidence, project.id),
  };
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="evidence.json"',
    },
  });
}

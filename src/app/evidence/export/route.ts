import { getWorkspace } from "@/server/workspace";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const { db, project } = getWorkspace();
  const payload = {
    exportedAt: new Date().toISOString(),
    project: { name: project.name, connectedAt: project.createdAt },
    framework: db.frameworks[0],
    controls: db.controls,
    requirements: db.requirements,
    evidence: db.evidence,
  };
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="evidence.json"',
    },
  });
}

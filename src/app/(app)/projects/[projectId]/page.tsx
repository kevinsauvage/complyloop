import { redirect } from "next/navigation";

import { projectPath } from "@/core/routes";

/** `/projects/<id>` is the project's entry point: it opens on the dashboard. */
export default async function ProjectRootPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(projectPath(projectId, "dashboard"));
}

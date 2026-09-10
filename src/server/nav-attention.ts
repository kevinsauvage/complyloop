import "server-only";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import { getDrizzle } from "@complyloop/db/postgres";
import {
  countNavAttentionForProject,
  type NavAttentionCounts,
} from "@complyloop/db/repo/nav-attention";
import { scopedControlIds } from "./project-scope";

export type { NavAttentionCounts };

/** Nav badges without hydrating the full findings/alerts arrays. */
export async function navAttentionForProject(
  project: Project,
): Promise<NavAttentionCounts> {
  const controlIds = scopedControlIds(project);
  return countNavAttentionForProject(
    await getDrizzle(),
    project.id,
    controlIds ? [...controlIds] : undefined,
  );
}

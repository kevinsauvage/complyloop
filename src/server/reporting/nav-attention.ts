import "server-only";

import type { Project } from "@complyloop/analysis-core/contract/project-types";
import { getDrizzle } from "@complyloop/db/postgres";
import {
  countNavAttentionForProject,
  type NavAttentionCounts,
} from "@complyloop/db/repo/nav-attention";

import { scopedControlIds } from "../workspace/project-scope";

/** Nav badges without hydrating the full findings/alerts arrays. */
export type { NavAttentionCounts };

/**
 * Single app entry for badge counts: preset scoping lives here, SQL lives in
 * `packages/db/repo/nav-attention.ts` (`countNavAttentionForProject`, its
 * only caller). Do not duplicate this query elsewhere.
 */
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

import "server-only";

import { cache } from "react";

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
 *
 * Memoized per request on the `Project` object (`getWorkspace` is cached, so
 * every caller passes the same instance): the shell badges and the dashboard
 * open-findings total are one query, not two identical counts.
 */
export const navAttentionForProject = cache(
  async (project: Project): Promise<NavAttentionCounts> => {
    const controlIds = scopedControlIds(project);
    return countNavAttentionForProject(
      await getDrizzle(),
      project.id,
      controlIds ? [...controlIds] : undefined,
    );
  },
);

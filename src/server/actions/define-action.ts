import type { Finding } from "@complyloop/analysis-core/contract/entities";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { getFindingById } from "@complyloop/db/repo/findings";

import type { ActionState } from "@/core/actions/action-state";
import { parseEntityId } from "@/core/actions/validate";
import type { Permission } from "@/core/rbac";

import { runAction } from "../action-state";
import { requireFinding } from "../workspace/workspace";
import {
  type ProjectTx,
  resolveActiveProjectId,
  withProjectTx,
} from "../workspace/workspace-write";
import { COMPLIANCE_LOOP_ROUTES } from "./refresh-routes";
import { refresh } from "./shared";

export type FindingTx = ProjectTx & {
  /** Re-read inside the transaction, under the project lock. */
  finding: Finding;
  /** Lock-free read used to resolve the project (drift checks). */
  preview: Finding;
};

/**
 * Canonical single-finding mutation: parse id → resolve the finding's project →
 * project lock + transaction → re-read the finding under the lock → revalidate
 * routes → success message. Handlers write the rows they touch through repo
 * functions. Throw `PublicError` inside `fn` (or let `parseEntityId` throw);
 * `runAction` maps it to `ActionState`.
 */
export function runFindingAction(
  findingIdRaw: string,
  permission: Permission,
  fn: (ctx: FindingTx) => Promise<void>,
  message: string,
  routes: readonly string[] = COMPLIANCE_LOOP_ROUTES,
): Promise<ActionState> {
  return runAction(async () => {
    const findingId = parseEntityId(findingIdRaw);
    // Lock-free preview only to resolve the project (and to fail fast for
    // callers that were never allowed near it). Everything mutated below is
    // re-read inside the transaction, under the project lock.
    const preview = await requireFinding(findingId);
    await withProjectTx(preview.projectId, permission, async (ctx) => {
      const finding = await getFindingById(ctx.tx, findingId);
      if (!finding) throw new PublicError("Unknown finding.");
      await fn({ ...ctx, finding, preview });
    });
    refresh(...routes);
    return message;
  });
}

/**
 * Canonical active-project mutation: resolve the active project → project lock
 * + transaction → revalidate → success message. Parse form input inside `fn` so
 * validation errors are mapped by `runAction`.
 */
export function runProjectAction(
  permission: Permission,
  fn: (ctx: ProjectTx) => Promise<void>,
  message: string,
  routes: readonly string[] = COMPLIANCE_LOOP_ROUTES,
): Promise<ActionState> {
  return runAction(async () => {
    const projectId = await resolveActiveProjectId();
    await withProjectTx(projectId, permission, fn);
    refresh(...routes);
    return message;
  });
}

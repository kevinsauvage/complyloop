import type { Finding } from "@complyloop/analysis-core/contract/entities";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { getFindingById } from "@complyloop/db/repo/findings";

import type { ActionState } from "@/core/actions/action-state";
import { parseEntityId } from "@/core/actions/validate";
import type { Permission } from "@/core/rbac";

import { runAction } from "../action-state";
import { requireFinding, requireRequirement } from "../workspace/workspace";
import { type ProjectTx, withProjectTx } from "../workspace/workspace-write";
import { COMPLIANCE_LOOP_ROUTES } from "./refresh-routes";
import { refresh } from "./shared";

export type FindingTx = ProjectTx & {
  /** Re-read inside the transaction, under the project lock. */
  finding: Finding;
  /** Lock-free read used to resolve the project (drift checks). */
  preview: Finding;
};

/**
 * The project owning a finding id, via a lock-free preview read. Bulk finding
 * actions take their scope from the ids they were handed — the ids already pin
 * the project, so they never need a cookie or a form field.
 */
export async function projectIdForFinding(findingId: string): Promise<string> {
  return (await requireFinding(findingId)).projectId;
}

/**
 * The project owning a requirement id, via a lock-free read. Requirement
 * decisions take their scope from the row they act on, same as findings.
 */
export async function projectIdForRequirement(
  requirementId: string,
): Promise<string> {
  return (await requireRequirement(requirementId)).projectId;
}

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
 * Canonical row-scoped mutation for a caller that must resolve its own project:
 * `resolveProjectId` runs inside `runAction` (so a `PublicError` from parsing or
 * lookup maps to `ActionState`), then project lock + transaction → revalidate →
 * success message. Parse form input inside `fn` so validation errors are mapped
 * the same way.
 */
export function runProjectAction(
  resolveProjectId: () => Promise<string>,
  permission: Permission,
  fn: (ctx: ProjectTx) => Promise<void>,
  message: string,
  routes: readonly string[] = COMPLIANCE_LOOP_ROUTES,
): Promise<ActionState> {
  return runAction(async () => {
    const projectId = await resolveProjectId();
    await withProjectTx(projectId, permission, fn);
    refresh(...routes);
    return message;
  });
}

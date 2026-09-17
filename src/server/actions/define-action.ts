import type { ActionState } from "@/core/action-state";
import type { Permission } from "@/core/rbac";
import { parseEntityId } from "@/core/validate";

import { runAction } from "../action-state";
import type { ProjectWriteWorkspace } from "../workspace/workspace";
import {
  withFindingWrite,
  withProjectWrite,
} from "../workspace/workspace-write";
import { COMPLIANCE_LOOP_ROUTES } from "./refresh-routes";
import { refresh } from "./shared";

type FindingWriteHandler = Parameters<typeof withFindingWrite>[2];
type ProjectWriteHandler = (
  workspace: ProjectWriteWorkspace,
) => Promise<import("@complyloop/db/repo/apply").ProjectWritePayload | void>;

/**
 * Canonical single-finding mutation: parse id → finding-scoped write →
 * revalidate triage routes → success message. Throw `PublicError` inside
 * `fn` (or let `parseEntityId` throw); `runAction` maps it to `ActionState`.
 */
export function runFindingAction(
  findingIdRaw: string,
  permission: Permission,
  fn: FindingWriteHandler,
  message: string,
  routes: readonly string[] = COMPLIANCE_LOOP_ROUTES,
): Promise<ActionState> {
  return runAction(async () => {
    const findingId = parseEntityId(findingIdRaw);
    await withFindingWrite(findingId, permission, fn);
    refresh(...routes);
    return message;
  });
}

/**
 * Canonical active-project mutation: project-scoped write → revalidate →
 * success message. Parse form input inside `fn` so validation errors are
 * mapped by `runAction`.
 */
export function runProjectAction(
  fn: ProjectWriteHandler,
  message: string,
  routes: readonly string[] = COMPLIANCE_LOOP_ROUTES,
): Promise<ActionState> {
  return runAction(async () => {
    await withProjectWrite(fn);
    refresh(...routes);
    return message;
  });
}

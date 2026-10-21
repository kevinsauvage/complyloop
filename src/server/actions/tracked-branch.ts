"use server";

import { z } from "zod";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { updateProject } from "@complyloop/db/repo/projects";

import type { ActionState } from "@/core/actions/action-state";
import { parseForm } from "@/core/actions/validate";

import { runAction } from "../action-state";
import { parseCheckoutRef } from "../assessment/repo-checkout";
import {
  assertBranchExists,
  resolveProjectGitHubToken,
} from "../github/github-access";
import { assertRuntimeAuditRateLimit } from "../rate-limit";
import { getWorkspace } from "../workspace/workspace";
import {
  resolveActiveProjectId,
  withProjectTx,
} from "../workspace/workspace-write";
import { refresh, requireOnActive } from "./shared";

const updateTrackedBranchInput = z.object({
  trackedBranch: z.string().max(128).optional(),
});

/**
 * Points the project at the branch ComplyLoop treats as its truth: pushes and
 * deployments of that branch are authoritative and manual runs scan it. Empty
 * clears it (back to the repository's default branch).
 */
export async function updateTrackedBranchAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const parsed = parseForm(updateTrackedBranchInput, formData);
    const requested = parsed.trackedBranch?.trim() ?? "";
    const branch = requested.length > 0 ? parseCheckoutRef(requested) : null;

    // Verify against GitHub outside the write transaction (network call).
    if (branch !== null) {
      const current = await getWorkspace();
      requireOnActive(current, "project.connect");
      const fullName = current.project.github?.fullName;
      if (!fullName) {
        throw new PublicError(
          "This project is not connected to a GitHub repository.",
          "connect",
        );
      }
      const token = await resolveProjectGitHubToken(current.project);
      if (!token) {
        throw new PublicError(
          "Could not reach GitHub for this project. Reconnect it from Settings.",
          "connect",
        );
      }
      await assertBranchExists(token, fullName, branch);
    }

    const projectId = await resolveActiveProjectId();
    await withProjectTx(projectId, "project.connect", async (ctx) => {
      if (ctx.userId) {
        await assertRuntimeAuditRateLimit(ctx.userId, ctx.tx);
      }
      if (!ctx.project.github) {
        throw new PublicError(
          "This project is not connected to a GitHub repository.",
          "connect",
        );
      }
      const next = { ...ctx.project, github: { ...ctx.project.github } };
      if (branch === null) {
        delete next.github.trackedBranch;
      } else {
        next.github.trackedBranch = branch;
      }
      await updateProject(ctx.tx, next);
    });
    refresh("/settings", "/dashboard", "/requirements");
    return branch === null
      ? "Tracking the repository's default branch."
      : `Tracking branch "${branch}". Push to it, then run an assessment.`;
  });
}

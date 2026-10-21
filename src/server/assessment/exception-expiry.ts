import "server-only";

import { getDrizzle } from "@complyloop/db/postgres";
import { insertEvidenceRecords } from "@complyloop/db/repo/evidence";
import { getProjectById } from "@complyloop/db/repo/projects";
import {
  listRequirementsForProject,
  listTemporaryExceptionRequirements,
  upsertRequirements,
} from "@complyloop/db/repo/requirements";

import { exceptionHasLapsed } from "@/core/requirements/requirement-human-determination";

import { withProjectLock } from "../workspace/db";
import {
  clearExpiredExceptions,
  refreshRequirementsForControls,
} from "./assessment-status";

/**
 * Clears lapsed temporary exceptions on every project, not only the ones an
 * assessment happens to touch: a quiet project would otherwise keep showing
 * the exception, and the status it froze, long after it expired. Runs on the
 * worker tick. Each project is re-read under its write lock, so an exception
 * a human renewed or cleared meanwhile is left alone. Returns how many
 * exceptions were cleared.
 */
export async function expireLapsedExceptions(
  now = new Date(),
): Promise<number> {
  const drizzle = await getDrizzle();
  const projectIds = new Set(
    (await listTemporaryExceptionRequirements(drizzle))
      .filter((requirement) =>
        exceptionHasLapsed(requirement.exception, now.getTime()),
      )
      .map((requirement) => requirement.projectId),
  );

  let cleared = 0;
  for (const projectId of projectIds) {
    cleared += await withProjectLock(projectId, async (tx) => {
      const project = await getProjectById(tx, projectId);
      if (!project) return 0;
      const expired = clearExpiredExceptions(
        await listRequirementsForProject(tx, projectId),
        projectId,
        now,
      );
      if (expired.requirements.length === 0) return 0;
      await upsertRequirements(tx, expired.requirements);
      // Without the exception the status is no longer held: re-derive it
      // from the open findings, as clearing one by hand does.
      const refreshed = await refreshRequirementsForControls(
        tx,
        project,
        expired.requirements.map((requirement) => requirement.controlId),
      );
      await upsertRequirements(tx, refreshed.requirements);
      await insertEvidenceRecords(tx, [
        ...expired.evidence,
        ...refreshed.evidence,
      ]);
      return expired.requirements.length;
    });
  }
  return cleared;
}

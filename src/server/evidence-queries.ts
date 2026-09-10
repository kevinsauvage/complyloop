import "server-only";
import { cache } from "react";
import { getDrizzle } from "@complyloop/db/postgres";
import {
  countEvidenceForProject,
  countEvidenceKindsForProject,
  listEvidenceForExport,
  listEvidenceForFinding,
  listEvidencePageForProject,
  type EvidenceFilter,
} from "@complyloop/db/repo/evidence";
import { listRequirementsForProject } from "@complyloop/db/repo/requirements";

export const listEvidenceForFindingScoped = cache(async (findingId: string) =>
  listEvidenceForFinding(await getDrizzle(), findingId),
);

export async function loadEvidencePage(
  projectId: string,
  page: number,
  pageSize: number,
  filter: EvidenceFilter,
  filtered: boolean,
) {
  const drizzle = await getDrizzle();
  const [requirements, kindCounts, items, filteredTotal] = await Promise.all([
    listRequirementsForProject(drizzle, projectId),
    countEvidenceKindsForProject(drizzle, projectId),
    listEvidencePageForProject(drizzle, projectId, page, pageSize, filter),
    filtered
      ? countEvidenceForProject(drizzle, projectId, filter)
      : Promise.resolve(null),
  ]);
  return { requirements, kindCounts, items, filteredTotal };
}

export async function loadEvidenceExport(projectId: string) {
  const drizzle = await getDrizzle();
  const [exported, requirements] = await Promise.all([
    listEvidenceForExport(drizzle, projectId),
    listRequirementsForProject(drizzle, projectId),
  ]);
  return { exported, requirements };
}

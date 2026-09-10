import "server-only";
import { cache } from "react";
import { getDrizzle } from "@complyloop/db/postgres";
import { countFindingsByStatusForProject } from "@complyloop/db/repo/findings";

export const countFindingsByStatus = cache(async (projectId: string) =>
  countFindingsByStatusForProject(await getDrizzle(), projectId),
);

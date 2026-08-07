import { asc } from "drizzle-orm";
import type { Project } from "@/core/types";
import type { Db } from "./types";
import type { DrizzleDb } from "./client";
import {
  alerts,
  appMeta,
  assessments,
  controls,
  evidence,
  findings,
  frameworks,
  memberships,
  organizations,
  projects,
  remediations,
  requirements,
} from "./schema";
import { rowToEvidence } from "./postgres-evidence";
import { ACTIVE_PROJECT_KEY } from "./postgres-meta";

/** Drops legacy durable-clone `rootPath` from JSONB payloads. */
function normalizeProject(payload: Project): Project {
  if (!("rootPath" in payload)) return payload;
  const { rootPath: _removed, ...rest } = payload as Project & {
    rootPath?: string;
  };
  return rest;
}

export async function loadDbFromPostgres(drizzle: DrizzleDb): Promise<Db> {
  const [
    frameworkRows,
    controlRows,
    organizationRows,
    membershipRows,
    projectRows,
    requirementRows,
    assessmentRows,
    findingRows,
    remediationRows,
    evidenceRows,
    alertRows,
    metaRows,
  ] = await Promise.all([
    drizzle.select().from(frameworks),
    drizzle.select().from(controls),
    drizzle.select().from(organizations),
    drizzle.select().from(memberships),
    drizzle.select().from(projects),
    drizzle.select().from(requirements),
    drizzle.select().from(assessments),
    drizzle.select().from(findings),
    drizzle.select().from(remediations),
    drizzle.select().from(evidence).orderBy(asc(evidence.at)),
    drizzle.select().from(alerts),
    drizzle.select().from(appMeta),
  ]);

  const activeMeta = metaRows.find((row) => row.key === ACTIVE_PROJECT_KEY);
  let activeProjectId: string | null = null;
  if (activeMeta) {
    const value = activeMeta.value;
    if (typeof value === "string") activeProjectId = value;
    else if (value === null) activeProjectId = null;
  }

  return {
    frameworks: frameworkRows.map((row) => row.payload),
    controls: controlRows.map((row) => row.payload),
    organizations: organizationRows.map((row) => row.payload),
    memberships: membershipRows.map((row) => row.payload),
    projects: projectRows.map((row) => normalizeProject(row.payload)),
    activeProjectId,
    requirements: requirementRows.map((row) => row.payload),
    assessments: assessmentRows.map((row) => row.payload),
    findings: findingRows.map((row) => row.payload),
    remediations: remediationRows.map((row) => row.payload),
    evidence: evidenceRows.map(rowToEvidence),
    alerts: alertRows.map((row) => row.payload),
  };
}


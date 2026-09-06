import type {
  Alert,
  EvidenceRecord,
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/finding-types";
import type { Project, Requirement } from "@complyloop/domain/project-types";
import type { DrizzleDb } from "./client.ts";
import { insertAlerts } from "./repo/alerts.ts";
import { insertEvidenceRecords } from "./repo/evidence.ts";
import { upsertFindings } from "./repo/findings.ts";
import { newEvidenceRecord } from "./repo/mappers.ts";
import { upsertRemediations } from "./repo/remediations.ts";
import {
  upsertRequirements,
  type UpsertRequirementsOptions,
} from "./repo/requirements.ts";
import { updateProject } from "./repo/projects.ts";
import type { Db } from "./types.ts";

/** Explicit rows to persist for a project-scoped write. */
export interface ProjectWritePayload {
  findings?: Finding[];
  remediations?: Remediation[];
  requirements?: Requirement[];
  evidence?: EvidenceRecord[];
  alerts?: Alert[];
  project?: Project;
}

export interface PersistProjectWriteOptions {
  loadedRequirementUpdatedAtById?: ReadonlyMap<string, string>;
  loadedFindingUpdatedAtById?: ReadonlyMap<string, string>;
  loadedRemediationUpdatedAtById?: ReadonlyMap<string, string>;
}

export interface ProjectWriteCollector {
  upsertFinding(finding: Finding): void;
  upsertRemediation(remediation: Remediation): void;
  upsertRequirement(requirement: Requirement): void;
  addEvidence(entry: Omit<EvidenceRecord, "id" | "at">): EvidenceRecord;
  upsertAlert(alert: Alert): void;
  setProject(project: Project): void;
  snapshot(): ProjectWritePayload;
}

function replaceInArray<T extends { id: string }>(
  items: T[],
  updated: T,
): void {
  const index = items.findIndex((candidate) => candidate.id === updated.id);
  if (index >= 0) {
    items[index] = updated;
    return;
  }
  items.push(updated);
}

/** Queues explicit upserts while keeping the in-memory `Db` in sync for reads. */
export function createProjectWriteCollector(db: Db): ProjectWriteCollector {
  const findings = new Map<string, Finding>();
  const remediations = new Map<string, Remediation>();
  const requirements = new Map<string, Requirement>();
  const evidence: EvidenceRecord[] = [];
  const alerts = new Map<string, Alert>();
  let projectUpdate: Project | undefined;

  return {
    upsertFinding(finding) {
      replaceInArray(db.findings, finding);
      findings.set(finding.id, finding);
    },
    upsertRemediation(remediation) {
      replaceInArray(db.remediations, remediation);
      remediations.set(remediation.id, remediation);
    },
    upsertRequirement(requirement) {
      replaceInArray(db.requirements, requirement);
      requirements.set(requirement.id, requirement);
    },
    addEvidence(entry) {
      const record = newEvidenceRecord(entry);
      db.evidence.push(record);
      evidence.push(record);
      return record;
    },
    upsertAlert(alert) {
      replaceInArray(db.alerts, alert);
      alerts.set(alert.id, alert);
    },
    setProject(project) {
      replaceInArray(db.projects, project);
      projectUpdate = project;
    },
    snapshot() {
      const payload: ProjectWritePayload = {};
      if (findings.size > 0) payload.findings = [...findings.values()];
      if (remediations.size > 0) payload.remediations = [...remediations.values()];
      if (requirements.size > 0) payload.requirements = [...requirements.values()];
      if (evidence.length > 0) payload.evidence = evidence;
      if (alerts.size > 0) payload.alerts = [...alerts.values()];
      if (projectUpdate) payload.project = projectUpdate;
      return payload;
    },
  };
}

export async function persistProjectWrite(
  tx: DrizzleDb,
  payload: ProjectWritePayload,
  options: PersistProjectWriteOptions = {},
): Promise<void> {
  const requirementOptions: UpsertRequirementsOptions | undefined =
    options.loadedRequirementUpdatedAtById
      ? { loadedUpdatedAtById: options.loadedRequirementUpdatedAtById }
      : undefined;

  await upsertFindings(tx, payload.findings ?? [], {
    loadedUpdatedAtById: options.loadedFindingUpdatedAtById,
  });
  await upsertRemediations(tx, payload.remediations ?? [], {
    loadedUpdatedAtById: options.loadedRemediationUpdatedAtById,
  });
  await upsertRequirements(
    tx,
    payload.requirements ?? [],
    requirementOptions ?? {},
  );
  await insertAlerts(tx, payload.alerts ?? []);
  await insertEvidenceRecords(tx, payload.evidence ?? []);
  if (payload.project) {
    await updateProject(tx, payload.project);
  }
}

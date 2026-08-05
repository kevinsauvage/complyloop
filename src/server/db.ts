import fs from "node:fs";
import path from "node:path";
import type {
  Alert,
  Assessment,
  Control,
  EvidenceRecord,
  Finding,
  Framework,
  Project,
  Remediation,
  RemediationSuggestion,
  Requirement,
} from "@/core/types";

/**
 * Persistence boundary for the MVP (JSON file today).
 * When leaving the single-laptop demo, swap the load/save implementation for
 * PostgreSQL + org/RBAC without changing callers that depend on this shape.
 */
export interface Db {
  frameworks: Framework[];
  controls: Control[];
  projects: Project[];
  /** Which project the UI and actions currently target. */
  activeProjectId: string | null;
  requirements: Requirement[];
  assessments: Assessment[];
  findings: Finding[];
  remediations: Remediation[];
  evidence: EvidenceRecord[];
  /** Regression / monitoring alerts (append-friendly, markable as read). */
  alerts: Alert[];
}

function emptyDb(): Db {
  return {
    frameworks: [],
    controls: [],
    projects: [],
    activeProjectId: null,
    requirements: [],
    assessments: [],
    findings: [],
    remediations: [],
    evidence: [],
    alerts: [],
  };
}

type StoredProject = Omit<Project, "source"> & {
  source?: Project["source"];
};

type StoredSuggestion = Omit<RemediationSuggestion, "provenance"> & {
  provenance?: RemediationSuggestion["provenance"];
};

type StoredRemediation = Omit<Remediation, "suggestion"> & {
  suggestion: StoredSuggestion | null;
};

type StoredDb = Omit<
  Db,
  "projects" | "activeProjectId" | "remediations" | "alerts"
> & {
  projects: StoredProject[];
  activeProjectId?: string | null;
  remediations: StoredRemediation[];
  alerts?: Alert[];
};

/** Normalizes records written before `source` / `activeProjectId` existed. */
function migrateDb(raw: StoredDb): Db {
  const projects: Project[] = raw.projects.map((project) => {
    if (project.source) {
      return { ...project, source: project.source };
    }
    const isSample =
      project.name === "sample-shop" ||
      project.rootPath.includes(`${path.sep}workspaces${path.sep}sample-shop`);
    return {
      ...project,
      source: isSample ? "sample" : "local",
      sourceRef: isSample ? undefined : project.rootPath,
    };
  });
  const activeProjectId =
    raw.activeProjectId && projects.some((project) => project.id === raw.activeProjectId)
      ? raw.activeProjectId
      : (projects[0]?.id ?? null);

  const remediations: Remediation[] = raw.remediations.map((remediation) => {
    if (!remediation.suggestion) {
      return { ...remediation, suggestion: null };
    }
    const suggestion: RemediationSuggestion = {
      ...remediation.suggestion,
      provenance: remediation.suggestion.provenance ?? "deterministic",
    };
    return { ...remediation, suggestion };
  });

  return {
    ...raw,
    projects,
    activeProjectId,
    remediations,
    alerts: raw.alerts ?? [],
  };
}

function dataDir(): string {
  return process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
}

export function workspacesDir(): string {
  return path.join(dataDir(), "workspaces");
}

function dbFilePath(): string {
  return path.join(dataDir(), "db.json");
}

export function loadDb(): Db {
  if (!fs.existsSync(dbFilePath())) return emptyDb();
  return migrateDb(JSON.parse(fs.readFileSync(dbFilePath(), "utf8")) as StoredDb);
}

export function saveDb(db: Db): void {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(dbFilePath(), JSON.stringify(db, null, 2));
}

/** Evidence is append-only: records are added here and never mutated or removed. */
export function addEvidence(
  db: Db,
  entry: Omit<EvidenceRecord, "id" | "at">,
): EvidenceRecord {
  const record: EvidenceRecord = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    ...entry,
  };
  db.evidence.push(record);
  return record;
}

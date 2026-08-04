import fs from "node:fs";
import path from "node:path";
import type {
  Assessment,
  Control,
  EvidenceRecord,
  Finding,
  Framework,
  Project,
  Remediation,
  Requirement,
} from "@/core/types";

export interface Db {
  frameworks: Framework[];
  controls: Control[];
  projects: Project[];
  requirements: Requirement[];
  assessments: Assessment[];
  findings: Finding[];
  remediations: Remediation[];
  evidence: EvidenceRecord[];
}

function emptyDb(): Db {
  return {
    frameworks: [],
    controls: [],
    projects: [],
    requirements: [],
    assessments: [],
    findings: [],
    remediations: [],
    evidence: [],
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
  return JSON.parse(fs.readFileSync(dbFilePath(), "utf8")) as Db;
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

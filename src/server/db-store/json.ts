import fs from "node:fs";
import path from "node:path";
import type { Db } from "./types";
import type {
  Alert,
  Project,
  Remediation,
  RemediationSuggestion,
} from "@/core/types";

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
  | "projects"
  | "activeProjectId"
  | "remediations"
  | "alerts"
  | "organizations"
  | "memberships"
> & {
  projects: StoredProject[];
  activeProjectId?: string | null;
  remediations: StoredRemediation[];
  alerts?: Alert[];
  organizations?: Db["organizations"];
  memberships?: Db["memberships"];
};

export function emptyDb(): Db {
  return {
    frameworks: [],
    controls: [],
    organizations: [],
    memberships: [],
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

/** Normalizes records written before `source` / `activeProjectId` / orgs existed. */
export function migrateDb(raw: StoredDb): Db {
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
    raw.activeProjectId &&
    projects.some((project) => project.id === raw.activeProjectId)
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
    frameworks: raw.frameworks,
    controls: raw.controls,
    organizations: raw.organizations ?? [],
    memberships: raw.memberships ?? [],
    projects,
    activeProjectId,
    requirements: raw.requirements,
    assessments: raw.assessments,
    findings: raw.findings,
    remediations,
    evidence: raw.evidence,
    alerts: raw.alerts ?? [],
  };
}

export function dataDir(): string {
  return process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
}

function dbFilePath(): string {
  return path.join(dataDir(), "db.json");
}

export function loadDbFromJson(): Db {
  if (!fs.existsSync(dbFilePath())) return emptyDb();
  return migrateDb(
    JSON.parse(fs.readFileSync(dbFilePath(), "utf8")) as StoredDb,
  );
}

export function saveDbToJson(db: Db): void {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(dbFilePath(), JSON.stringify(db, null, 2));
}

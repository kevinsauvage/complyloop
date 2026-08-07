import fs from "node:fs";
import path from "node:path";
import type { Db } from "./types";
import type {
  Alert,
  Project,
  ProjectSource,
  Remediation,
  RemediationSuggestion,
} from "@/core/types";

type LegacyProjectSource = ProjectSource | "sample" | "local" | "git";

type StoredProject = Omit<Project, "source"> & {
  source?: LegacyProjectSource;
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

function isGitHubProject(project: StoredProject): boolean {
  return project.source === "github";
}

/** Normalizes records written before `source` / `activeProjectId` / orgs existed. */
export function migrateDb(raw: StoredDb): Db {
  const projects: Project[] = raw.projects
    .filter((project) => isGitHubProject(project))
    .map((project) => ({ ...project, source: "github" as const }));

  const projectIds = new Set(projects.map((project) => project.id));
  const findings = raw.findings.filter((finding) =>
    projectIds.has(finding.projectId),
  );
  const findingIds = new Set(findings.map((finding) => finding.id));

  const activeProjectId =
    raw.activeProjectId && projectIds.has(raw.activeProjectId)
      ? raw.activeProjectId
      : (projects[0]?.id ?? null);

  const remediations: Remediation[] = raw.remediations
    .filter((remediation) => findingIds.has(remediation.findingId))
    .map((remediation) => {
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
    requirements: raw.requirements.filter((requirement) =>
      projectIds.has(requirement.projectId),
    ),
    assessments: raw.assessments.filter((assessment) =>
      projectIds.has(assessment.projectId),
    ),
    findings,
    remediations,
    evidence: raw.evidence,
    alerts: (raw.alerts ?? []).filter((alert) =>
      projectIds.has(alert.projectId),
    ),
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

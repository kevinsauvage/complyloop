import type { Project, ProjectGitHubMeta } from "@/core/project-types";
import { canOnProject } from "@/core/rbac";
import { rgaaPresets } from "@/adapters/rgaa/presets";
import { addEvidence, type Db } from "./db";
import { ConnectError } from "./connect-error";
import { accessFromStore, resolveActiveProject } from "./project-visibility";
import { removeProjectScopedRecords } from "./project-cascade";
import { withRepoCheckout } from "./repo-checkout";
import {
  addConnectedProject,
  assertAssessableRoot,
  deriveProjectName,
  uniqueProjectName,
} from "./connect-shared";

/** GitHub full names are case-insensitive; normalize for map keys and equality. */
export function normalizeGitHubFullName(fullName: string): string {
  return fullName.trim().toLowerCase();
}

/**
 * A GitHub repo is already connected for this org when it belongs to the
 * active org. Matches connect-action duplicate detection.
 */
export function findConnectedGitHubProject(
  projects: ReadonlyArray<Project>,
  fullName: string,
  activeOrgId: string | null,
): Project | undefined {
  if (!activeOrgId) return undefined;
  const needle = normalizeGitHubFullName(fullName);
  return projects.find((project) => {
    if (project.source !== "github" || !project.github?.fullName) return false;
    if (normalizeGitHubFullName(project.github.fullName) !== needle) {
      return false;
    }
    return project.orgId === activeOrgId;
  });
}

/**
 * fullName (any casing) → project id for repos already connected in the
 * active org — used by the GitHub picker Connected / Disconnect UI.
 */
export function connectedGitHubProjectsByFullName(
  projects: ReadonlyArray<Project>,
  activeOrgId: string | null,
): Record<string, string> {
  if (!activeOrgId) return {};
  const map: Record<string, string> = {};
  for (const project of projects) {
    if (project.source !== "github" || !project.github?.fullName) continue;
    if (project.orgId !== activeOrgId) continue;
    map[normalizeGitHubFullName(project.github.fullName)] = project.id;
  }
  return map;
}

interface ConnectGitHubRepoInput {
  fullName: string;
  defaultBranch: string;
  private: boolean;
  ownerUserId: string;
  orgId: string;
  accessToken: string;
  /** GitHub App installation id when connecting under least-privilege App access. */
  installationId?: number;
}

/**
 * Validates a GitHub repo via ephemeral clone, then records the project in the
 * store (no durable workspace on disk).
 */
export async function connectGitHubRepo(
  db: Db,
  input: ConnectGitHubRepoInput,
): Promise<Project> {
  const fullName = input.fullName.trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(fullName)) {
    throw new ConnectError(`Invalid GitHub repository name: ${fullName}`);
  }
  if (!input.orgId) {
    throw new ConnectError(
      "Select an organization before connecting a repository.",
    );
  }

  const sourceRef = `https://github.com/${fullName}`;
  const existing = db.projects.find(
    (project) =>
      project.source === "github" &&
      project.orgId === input.orgId &&
      (project.github?.fullName === fullName || project.sourceRef === sourceRef),
  );
  if (existing) {
    return existing;
  }

  await withRepoCheckout(
    { fullName, accessToken: input.accessToken },
    async (rootPath) => {
      assertAssessableRoot(rootPath);
    },
  );

  const name = uniqueProjectName(db, deriveProjectName(fullName));
  const github: ProjectGitHubMeta = {
    fullName,
    defaultBranch: input.defaultBranch || "main",
    private: input.private,
    ...(input.installationId != null
      ? { installationId: input.installationId }
      : {}),
  };

  const orgId = input.orgId;

  const rgaaFull = rgaaPresets.find((preset) => preset.id === "preset-rgaa-full");
  if (!rgaaFull) {
    throw new Error("Missing preset-rgaa-full");
  }

  return addConnectedProject(
    db,
    {
      id: crypto.randomUUID(),
      name,
      source: "github",
      sourceRef,
      ownerUserId: input.ownerUserId,
      orgId,
      github,
      assessmentPresetId: rgaaFull.id,
      inScopeControlIds: [...rgaaFull.controlIds],
      createdAt: new Date().toISOString(),
    },
    `Connected GitHub repository ${fullName}`,
  );
}

/**
 * Disconnects a GitHub project when the actor has `project.connect`:
 * drops project-scoped records and records evidence.
 * Returns the next visible project id for the cookie (or null).
 */
export function disconnectGitHubRepo(
  db: Db,
  projectId: string,
  userId: string,
): string | null {
  const project = db.projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    throw new ConnectError("Unknown project.");
  }
  if (project.source !== "github") {
    throw new ConnectError("Only GitHub projects can be disconnected.");
  }
  if (!canOnProject(project, db.memberships, userId, "project.connect")) {
    throw new ConnectError(
      "You do not have permission to disconnect this project.",
    );
  }

  const fullName = project.github?.fullName ?? project.name;
  removeProjectScopedRecords(db, projectId);
  db.projects = db.projects.filter((candidate) => candidate.id !== projectId);

  addEvidence(db, {
    kind: "project_disconnected",
    summary: `Disconnected GitHub repository ${fullName}`,
    projectId: project.id,
    detail: {
      source: "github",
      fullName,
    },
  });

  return (
    resolveActiveProject(
      db.projects,
      null,
      accessFromStore(db, userId),
    )?.id ?? null
  );
}

import type { Project, ProjectGitHubMeta } from "@/core/types";
import { canOnProject } from "@/core/rbac";
import { addEvidence, type Db } from "./db";
import { defaultOrgIdForUser } from "./orgs";
import { ConnectError } from "./connect-url";
import { accessFromStore, resolveActiveProject } from "./project-visibility";
import { withRepoCheckout } from "./repo-checkout";
import {
  addConnectedProject,
  assertAssessableRoot,
  deriveProjectName,
  githubCloneUrl,
  uniqueProjectName,
} from "./connect-shared";

export { githubCloneUrl };

/** GitHub full names are case-insensitive; normalize for map keys and equality. */
export function normalizeGitHubFullName(fullName: string): string {
  return fullName.trim().toLowerCase();
}

/**
 * A GitHub repo is already connected for this session when it belongs to the
 * active org, or was connected by this user (owner). Matches connect-action
 * duplicate detection so the picker never shows Connect for those repos.
 */
export function findConnectedGitHubProject(
  projects: ReadonlyArray<Project>,
  fullName: string,
  userId: string,
  activeOrgId: string | null,
): Project | undefined {
  const needle = normalizeGitHubFullName(fullName);
  return projects.find((project) => {
    if (project.source !== "github" || !project.github?.fullName) return false;
    if (normalizeGitHubFullName(project.github.fullName) !== needle) {
      return false;
    }
    if (project.ownerUserId === userId) return true;
    if (activeOrgId != null && project.orgId === activeOrgId) return true;
    return false;
  });
}

/**
 * fullName (any casing) → project id for repos already connected in this
 * workspace context — used by the GitHub picker Connected / Disconnect UI.
 */
export function connectedGitHubProjectsByFullName(
  projects: ReadonlyArray<Project>,
  userId: string,
  activeOrgId: string | null,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const project of projects) {
    if (project.source !== "github" || !project.github?.fullName) continue;
    if (
      project.ownerUserId !== userId &&
      !(activeOrgId != null && project.orgId === activeOrgId)
    ) {
      continue;
    }
    map[normalizeGitHubFullName(project.github.fullName)] = project.id;
  }
  return map;
}

interface ConnectGitHubRepoInput {
  fullName: string;
  defaultBranch: string;
  private: boolean;
  ownerUserId: string;
  /** Organization that owns the connected project (personal org by default). */
  orgId?: string;
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

  const sourceRef = `https://github.com/${fullName}`;
  const existing = db.projects.find(
    (project) =>
      project.source === "github" &&
      project.ownerUserId === input.ownerUserId &&
      (project.github?.fullName === fullName || project.sourceRef === sourceRef),
  );
  if (existing) {
    db.activeProjectId = existing.id;
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

  const orgId = input.orgId ?? defaultOrgIdForUser(db, input.ownerUserId);

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
      createdAt: new Date().toISOString(),
    },
    `Connected GitHub repository ${fullName}`,
  );
}

/**
 * Disconnects a GitHub project when the actor has `project.connect`:
 * drops project-scoped records and records evidence.
 */
export function disconnectGitHubRepo(
  db: Db,
  projectId: string,
  userId: string,
): void {
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
  const findingIds = new Set(
    db.findings
      .filter((finding) => finding.projectId === projectId)
      .map((finding) => finding.id),
  );

  db.requirements = db.requirements.filter(
    (requirement) => requirement.projectId !== projectId,
  );
  db.assessments = db.assessments.filter(
    (assessment) => assessment.projectId !== projectId,
  );
  db.findings = db.findings.filter(
    (finding) => finding.projectId !== projectId,
  );
  db.remediations = db.remediations.filter(
    (remediation) => !findingIds.has(remediation.findingId),
  );
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

  const next = resolveActiveProject(
    db.projects,
    db.activeProjectId,
    accessFromStore(db, userId),
  );
  db.activeProjectId = next?.id ?? null;
}

import fs from "node:fs";
import path from "node:path";
import type { Project, ProjectGitHubMeta } from "@/core/types";
import { canOnProject } from "@/core/rbac";
import { addEvidence, workspacesDir, type Db } from "./db";
import { createGit } from "./git";
import { defaultOrgIdForUser } from "./orgs";
import { ConnectError } from "./connect-url";
import { accessFromStore, resolveActiveProject } from "./project-visibility";
import { reportWarning } from "./observability";
import {
  addConnectedProject,
  assertAssessableOrRemove,
  cloneShallow,
  deriveProjectName,
  uniqueProjectName,
  uniqueWorkspacePath,
} from "./connect-shared";

/** Builds an authenticated HTTPS clone URL for GitHub (token never stored). */
export function githubCloneUrl(fullName: string, accessToken: string): string {
  const encoded = encodeURIComponent(accessToken);
  return `https://x-access-token:${encoded}@github.com/${fullName}.git`;
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
 * Shallow-clones a GitHub repo the user selected after OAuth into
 * `.data/workspaces/` and scopes it to that user.
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
  if (existing && fs.existsSync(existing.rootPath)) {
    db.activeProjectId = existing.id;
    return existing;
  }

  const name = uniqueProjectName(db, deriveProjectName(fullName));
  const rootPath = uniqueWorkspacePath(name);
  await cloneShallow(githubCloneUrl(fullName, input.accessToken), rootPath);

  // Strip embedded token from the remote URL stored in the clone.
  try {
    await createGit({ baseDir: rootPath }).remote([
      "set-url",
      "origin",
      sourceRef,
    ]);
  } catch (error) {
    reportWarning("Could not rewrite git remote origin after clone", {
      code: "git_remote_set_url_failed",
      fullName,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  assertAssessableOrRemove(rootPath);

  const github: ProjectGitHubMeta = {
    fullName,
    defaultBranch: input.defaultBranch || "main",
    private: input.private,
    ...(input.installationId != null
      ? { installationId: input.installationId }
      : {}),
  };

  const orgId =
    input.orgId ?? defaultOrgIdForUser(db, input.ownerUserId);

  return addConnectedProject(
    db,
    {
      id: crypto.randomUUID(),
      name,
      rootPath,
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
 * drops project-scoped records, removes the workspace clone, and records evidence.
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
  if (
    !canOnProject(project, db.memberships, userId, "project.connect")
  ) {
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

  // Only remove clones we own under the workspaces directory.
  const workspacesRoot = path.resolve(workspacesDir());
  const projectRoot = path.resolve(project.rootPath);
  if (
    projectRoot === workspacesRoot ||
    projectRoot.startsWith(`${workspacesRoot}${path.sep}`)
  ) {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }

  addEvidence(db, {
    kind: "project_disconnected",
    summary: `Disconnected GitHub repository ${fullName}`,
    projectId: project.id,
    detail: {
      source: "github",
      fullName,
      rootPath: project.rootPath,
    },
  });

  const next = resolveActiveProject(
    db.projects,
    db.activeProjectId,
    accessFromStore(db, userId),
  );
  db.activeProjectId = next?.id ?? null;
}

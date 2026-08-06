import fs from "node:fs";
import path from "node:path";
import { hasSourceFiles } from "@/analysis/source-files";
import type { Project, ProjectGitHubMeta } from "@/core/types";
import { canOnProject } from "@/core/rbac";
import { addEvidence, workspacesDir, type Db } from "./db";
import { createGit } from "./git";
import { defaultOrgIdForUser } from "./orgs";
import { assertSafeGitRemoteUrl, isLocalProjectConnectAllowed } from "./connect-policy";
import { ConnectError, isLikelyGitUrl } from "./connect-url";
import {
  type AccessContext,
  isProjectVisible,
  resolveActiveProject,
} from "./project-visibility";

export { ConnectError, isLikelyGitUrl } from "./connect-url";

/** Turns a path or git URL into a short, filesystem-safe project name. */
export function deriveProjectName(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  let base: string;
  if (trimmed.includes("://") || trimmed.startsWith("git@")) {
    const withoutGitSuffix = trimmed.replace(/\.git$/i, "");
    // SSH form: git@host:org/repo
    const afterColon = withoutGitSuffix.includes(":")
      ? withoutGitSuffix.slice(withoutGitSuffix.lastIndexOf(":") + 1)
      : withoutGitSuffix;
    base = afterColon.split("/").filter(Boolean).at(-1) ?? "project";
  } else {
    base = path.basename(trimmed);
  }
  const cleaned = base
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned.slice(0, 80) : "project";
}

export function assertAssessableRoot(rootPath: string): void {
  if (!fs.existsSync(rootPath)) {
    throw new ConnectError(`Path does not exist: ${rootPath}`);
  }
  const stats = fs.statSync(rootPath);
  if (!stats.isDirectory()) {
    throw new ConnectError(`Path is not a directory: ${rootPath}`);
  }
  if (!hasSourceFiles(rootPath, "script")) {
    throw new ConnectError(
      `No .tsx/.jsx/.ts/.js source files found under ${rootPath}. Connect a React/TypeScript project.`,
    );
  }
}

function uniqueWorkspacePath(name: string): string {
  const base = path.join(workspacesDir(), name);
  if (!fs.existsSync(base)) return base;
  let index = 2;
  while (fs.existsSync(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function uniqueProjectName(db: Db, desired: string): string {
  const taken = new Set(db.projects.map((project) => project.name));
  if (!taken.has(desired)) return desired;
  let index = 2;
  while (taken.has(`${desired}-${index}`)) index += 1;
  return `${desired}-${index}`;
}

function addConnectedProject(
  db: Db,
  project: Project,
  summary: string,
): Project {
  db.projects.push(project);
  db.activeProjectId = project.id;
  addEvidence(db, {
    kind: "project_connected",
    summary,
    projectId: project.id,
    detail: {
      source: project.source,
      rootPath: project.rootPath,
      sourceRef: project.sourceRef,
    },
  });
  return project;
}

/** Connect an existing directory on disk; remediations write in place. */
export function connectLocalPath(db: Db, rawPath: string): Project {
  if (!isLocalProjectConnectAllowed()) {
    throw new ConnectError(
      "Local path connects are disabled. Set ALLOW_LOCAL_PROJECT_CONNECT=true for the laptop demo, or use a git URL / GitHub picker.",
    );
  }
  const trimmed = rawPath.trim();
  if (trimmed.length === 0) {
    throw new ConnectError("Enter a local project path.");
  }
  const rootPath = path.resolve(trimmed);
  assertAssessableRoot(rootPath);

  const existing = db.projects.find(
    (project) =>
      project.source === "local" && path.resolve(project.rootPath) === rootPath,
  );
  if (existing) {
    db.activeProjectId = existing.id;
    return existing;
  }

  const name = uniqueProjectName(db, deriveProjectName(rootPath));
  return addConnectedProject(
    db,
    {
      id: crypto.randomUUID(),
      name,
      rootPath,
      source: "local",
      sourceRef: rootPath,
      createdAt: new Date().toISOString(),
    },
    `Connected local project "${name}" at ${rootPath}`,
  );
}

/**
 * Shallow-clones a git remote into `.data/workspaces/` and connects it.
 * Requires `git` on PATH.
 */
export async function connectGitUrl(db: Db, rawUrl: string): Promise<Project> {
  const url = rawUrl.trim();
  if (url.length === 0) {
    throw new ConnectError("Enter a git repository URL.");
  }
  assertSafeGitRemoteUrl(url);

  const existing = db.projects.find(
    (project) => project.source === "git" && project.sourceRef === url,
  );
  if (existing) {
    if (fs.existsSync(existing.rootPath)) {
      db.activeProjectId = existing.id;
      return existing;
    }
  }

  const name = uniqueProjectName(db, deriveProjectName(url));
  const rootPath = uniqueWorkspacePath(name);
  fs.mkdirSync(workspacesDir(), { recursive: true });

  try {
    await createGit().clone(url, rootPath, ["--depth", "1"]);
  } catch (error) {
    fs.rmSync(rootPath, { recursive: true, force: true });
    const detail = error instanceof Error ? error.message : "unknown error";
    throw new ConnectError(`git clone failed: ${detail.trim().slice(0, 400)}`);
  }

  try {
    assertAssessableRoot(rootPath);
  } catch (error) {
    fs.rmSync(rootPath, { recursive: true, force: true });
    throw error;
  }

  return addConnectedProject(
    db,
    {
      id: crypto.randomUUID(),
      name,
      rootPath,
      source: "git",
      sourceRef: url,
      createdAt: new Date().toISOString(),
    },
    `Cloned and connected "${name}" from ${url}`,
  );
}

/**
 * Connect from a single form field: git URL if it looks like one, otherwise
 * treat the value as a local filesystem path.
 */
export async function connectProjectInput(
  db: Db,
  input: string,
): Promise<Project> {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new ConnectError("Enter a local path or a git repository URL.");
  }
  return isLikelyGitUrl(trimmed)
    ? connectGitUrl(db, trimmed)
    : connectLocalPath(db, trimmed);
}

/** Builds an authenticated HTTPS clone URL for GitHub (token never stored). */
export function githubCloneUrl(fullName: string, accessToken: string): string {
  const encoded = encodeURIComponent(accessToken);
  return `https://x-access-token:${encoded}@github.com/${fullName}.git`;
}

export interface ConnectGitHubRepoInput {
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
  private: boolean;
  ownerUserId: string;
  /** Organization that owns the connected project (personal org by default). */
  orgId?: string;
  accessToken: string;
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
  fs.mkdirSync(workspacesDir(), { recursive: true });

  const authenticatedUrl = githubCloneUrl(fullName, input.accessToken);

  try {
    await createGit().clone(authenticatedUrl, rootPath, ["--depth", "1"]);
  } catch (error) {
    fs.rmSync(rootPath, { recursive: true, force: true });
    const detail = error instanceof Error ? error.message : "unknown error";
    throw new ConnectError(`git clone failed: ${detail.trim().slice(0, 400)}`);
  }

  // Strip embedded token from the remote URL stored in the clone.
  try {
    await createGit({ baseDir: rootPath }).remote([
      "set-url",
      "origin",
      sourceRef,
    ]);
  } catch {
    /* non-fatal — assessment does not need origin */
  }

  try {
    assertAssessableRoot(rootPath);
  } catch (error) {
    fs.rmSync(rootPath, { recursive: true, force: true });
    throw error;
  }

  const github: ProjectGitHubMeta = {
    fullName,
    defaultBranch: input.defaultBranch || "main",
    private: input.private,
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

function accessForUser(db: Db, userId: string | null | undefined): AccessContext {
  return {
    userId,
    organizations: db.organizations,
    memberships: db.memberships,
  };
}

export function setActiveProject(
  db: Db,
  projectId: string,
  userId?: string | null,
): Project {
  const project = db.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new ConnectError(`Unknown project: ${projectId}`);
  if (!isProjectVisible(project, accessForUser(db, userId))) {
    throw new ConnectError("You do not have access to that project.");
  }
  db.activeProjectId = project.id;
  return project;
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
    accessForUser(db, userId),
  );
  db.activeProjectId = next?.id ?? null;
}

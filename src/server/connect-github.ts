import fs from "node:fs";
import path from "node:path";
import { hasSourceFiles } from "@complyloop/analysis-core/source-files";
import type { Project, ProjectGitHubMeta } from "@complyloop/analysis-core/contract/project-types";
import { type EvidenceRecord } from "@complyloop/db/types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { canOnProject } from "@/core/rbac";
import { defaultConnectPreset } from "@complyloop/adapters/registry";
import { newEvidenceRecord } from "@complyloop/db/repo/mappers";
import type { Db } from "./db";
import { createGit } from "./git";
import { githubCloneUrl, normalizeGitHubFullName } from "./github-helpers";
import { accessFromStore, resolveActiveProject } from "./project-visibility";
import { withRepoCheckout } from "./repo-checkout";

export { githubCloneUrl, normalizeGitHubFullName };

/** Short filesystem-safe name from a GitHub `owner/repo` full name. */
export function deriveProjectName(fullName: string): string {
  const base = fullName.trim().split("/").filter(Boolean).at(-1) ?? "project";
  const cleaned = base
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned.slice(0, 80) : "project";
}

export function assertAssessableRoot(rootPath: string): void {
  if (!fs.existsSync(rootPath)) {
    throw new PublicError(`Path does not exist: ${rootPath}`, "connect");
  }
  const stats = fs.statSync(rootPath);
  if (!stats.isDirectory()) {
    throw new PublicError(`Path is not a directory: ${rootPath}`, "connect");
  }
  if (!hasSourceFiles(rootPath, "script")) {
    throw new PublicError(
      `No .tsx/.jsx/.ts/.js source files found under ${rootPath}. Connect a React/TypeScript project.`,
      "connect",
    );
  }
}

export function uniqueProjectName(db: Db, desired: string): string {
  const taken = new Set(db.projects.map((project) => project.name));
  if (!taken.has(desired)) return desired;
  let index = 2;
  while (taken.has(`${desired}-${index}`)) index += 1;
  return `${desired}-${index}`;
}

export function addConnectedProject(
  project: Project,
  summary: string,
): { project: Project; evidence: EvidenceRecord[] } {
  return {
    project,
    evidence: [
      newEvidenceRecord({
        kind: "project_connected",
        summary,
        projectId: project.id,
        detail: {
          source: project.source,
          sourceRef: project.sourceRef,
          fullName: project.github?.fullName,
        },
      }),
    ],
  };
}

/** Shallow-clones into `rootPath`; removes the directory on clone failure. */
export async function cloneShallow(
  cloneUrl: string,
  rootPath: string,
): Promise<void> {
  fs.mkdirSync(path.dirname(rootPath), { recursive: true });
  try {
    await createGit().clone(cloneUrl, rootPath, ["--depth", "1"]);
  } catch (error) {
    fs.rmSync(rootPath, { recursive: true, force: true });
    const detail = error instanceof Error ? error.message : "unknown error";
    throw new PublicError(
      `git clone failed: ${detail.trim().slice(0, 400)}`,
      "connect",
    );
  }
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
): Promise<{ project: Project; evidence: EvidenceRecord[] }> {
  const fullName = input.fullName.trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(fullName)) {
    throw new PublicError(`Invalid GitHub repository name: ${fullName}`, "connect");
  }
  if (!input.orgId) {
    throw new PublicError(
      "Select an organization before connecting a repository.",
      "connect",
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
    // Already connected: no-op, no duplicate evidence.
    return { project: existing, evidence: [] };
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

  const connectPreset = defaultConnectPreset();

  return addConnectedProject(
    {
      id: crypto.randomUUID(),
      name,
      source: "github",
      sourceRef,
      ownerUserId: input.ownerUserId,
      orgId,
      github,
      defaultPresetId: connectPreset.id,
      createdAt: new Date().toISOString(),
    },
    `Connected GitHub repository ${fullName}`,
  );
}

/**
 * Disconnects a GitHub project when the actor has `project.connect`.
 * Returns what to persist (scoped rows drop via the project FK cascade) plus
 * the next visible project id for the cookie. Does not mutate `db`.
 */
export function disconnectGitHubRepo(
  db: Db,
  projectId: string,
  userId: string,
): { deleteProjectId: string; evidence: EvidenceRecord; nextProjectId: string | null } {
  const project = db.projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    throw new PublicError("Unknown project.", "connect");
  }
  if (project.source !== "github") {
    throw new PublicError("Only GitHub projects can be disconnected.", "connect");
  }
  if (!canOnProject(project, db.memberships, userId, "project.connect")) {
    throw new PublicError(
      "You do not have permission to disconnect this project.",
      "connect",
    );
  }

  const fullName = project.github?.fullName ?? project.name;
  const evidence = newEvidenceRecord({
    kind: "project_disconnected",
    summary: `Disconnected GitHub repository ${fullName}`,
    projectId: project.id,
    detail: {
      source: "github",
      fullName,
    },
  });

  const remaining = db.projects.filter(
    (candidate) => candidate.id !== projectId,
  );
  const nextProjectId =
    resolveActiveProject(remaining, null, accessFromStore(db, userId))?.id ?? null;

  return { deleteProjectId: projectId, evidence, nextProjectId };
}

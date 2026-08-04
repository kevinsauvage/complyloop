import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Project } from "@/core/types";
import { addEvidence, workspacesDir, type Db } from "./db";

const SOURCE_EXTENSIONS = new Set([".tsx", ".jsx", ".ts", ".js"]);
const IGNORED_DIRECTORIES = new Set(["node_modules", ".next", ".git", "dist", "out"]);

export class ConnectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectError";
  }
}

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

export function isLikelyGitUrl(value: string): boolean {
  const trimmed = value.trim();
  if (/^https?:\/\/.+\.git$/i.test(trimmed)) return true;
  if (/^https?:\/\/(github\.com|gitlab\.com|bitbucket\.org)\//i.test(trimmed)) {
    return true;
  }
  if (/^git@[^:]+:.+\.git$/i.test(trimmed)) return true;
  if (/^ssh:\/\/git@/i.test(trimmed)) return true;
  return false;
}

function countSourceFiles(rootPath: string, limit = 1): number {
  let found = 0;
  const walk = (dir: string): void => {
    if (found >= limit) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found >= limit) return;
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) walk(path.join(dir, entry.name));
        continue;
      }
      if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) found += 1;
    }
  };
  walk(rootPath);
  return found;
}

export function assertAssessableRoot(rootPath: string): void {
  if (!fs.existsSync(rootPath)) {
    throw new ConnectError(`Path does not exist: ${rootPath}`);
  }
  const stats = fs.statSync(rootPath);
  if (!stats.isDirectory()) {
    throw new ConnectError(`Path is not a directory: ${rootPath}`);
  }
  if (countSourceFiles(rootPath) === 0) {
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
export function connectGitUrl(db: Db, rawUrl: string): Project {
  const url = rawUrl.trim();
  if (url.length === 0) {
    throw new ConnectError("Enter a git repository URL.");
  }
  if (!isLikelyGitUrl(url)) {
    throw new ConnectError(
      "That does not look like a git URL. Use https://github.com/org/repo or git@host:org/repo.git.",
    );
  }

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
    execFileSync("git", ["clone", "--depth", "1", url, rootPath], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
    });
  } catch (error) {
    fs.rmSync(rootPath, { recursive: true, force: true });
    const detail =
      error instanceof Error && "stderr" in error
        ? String((error as { stderr?: Buffer }).stderr?.toString() ?? error.message)
        : error instanceof Error
          ? error.message
          : "unknown error";
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
export function connectProjectInput(db: Db, input: string): Project {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new ConnectError("Enter a local path or a git repository URL.");
  }
  return isLikelyGitUrl(trimmed)
    ? connectGitUrl(db, trimmed)
    : connectLocalPath(db, trimmed);
}

export function setActiveProject(db: Db, projectId: string): Project {
  const project = db.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new ConnectError(`Unknown project: ${projectId}`);
  db.activeProjectId = project.id;
  return project;
}

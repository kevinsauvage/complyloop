import fs from "node:fs";
import path from "node:path";
import type { Project } from "@/core/types";
import { workspacesDir, type Db } from "./db";
import { createGit } from "./git";
import { assertSafeGitRemoteUrl, isLocalProjectConnectAllowed } from "./connect-policy";
import { ConnectError, isLikelyGitUrl } from "./connect-url";
import {
  addConnectedProject,
  assertAssessableRoot,
  deriveProjectName,
  uniqueProjectName,
  uniqueWorkspacePath,
} from "./connect-shared";

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


import fs from "node:fs";
import path from "node:path";
import { hasSourceFiles } from "@/analysis/source-files";
import type { Project } from "@/core/types";
import { addEvidence, type Db } from "./db";
import { createGit } from "./git";
import { ConnectError } from "./connect-url";

/** Builds an authenticated HTTPS clone URL for GitHub (token never stored). */
export function githubCloneUrl(fullName: string, accessToken: string): string {
  const encoded = encodeURIComponent(accessToken);
  return `https://x-access-token:${encoded}@github.com/${fullName}.git`;
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

export function uniqueProjectName(db: Db, desired: string): string {
  const taken = new Set(db.projects.map((project) => project.name));
  if (!taken.has(desired)) return desired;
  let index = 2;
  while (taken.has(`${desired}-${index}`)) index += 1;
  return `${desired}-${index}`;
}

export function addConnectedProject(
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
      sourceRef: project.sourceRef,
      fullName: project.github?.fullName,
    },
  });
  return project;
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
    throw new ConnectError(`git clone failed: ${detail.trim().slice(0, 400)}`);
  }
}

/** Asserts the clone is assessable; removes the directory on failure. */
export function assertAssessableOrRemove(rootPath: string): void {
  try {
    assertAssessableRoot(rootPath);
  } catch (error) {
    fs.rmSync(rootPath, { recursive: true, force: true });
    throw error;
  }
}

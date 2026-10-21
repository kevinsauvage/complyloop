import "server-only";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Project } from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { resolveInside } from "@complyloop/analysis-core/workspace-path";

import { isE2EHarnessEnabled } from "../e2e-harness";
import {
  createOctokit,
  octokitErrorMessage,
  parseOwnerRepo,
} from "../github/github";
import { getProjectToken } from "../github/github-connector";
import { refForProjectCheckout } from "../github/tracked-branch";
import { withFixtureCheckout } from "./fixture-checkout";

/**
 * Reads one file at the project's tracked branch through the contents API.
 * Used by request handlers that need a single source file (patch generation),
 * so a full clone stays worker-only.
 */
export async function readProjectFile(
  project: Project,
  filePath: string,
): Promise<string> {
  const fullName = project.github?.fullName;
  if (!fullName) {
    throw new PublicError(
      "Project has no GitHub repository metadata.",
      "connect",
    );
  }
  const accessToken = await getProjectToken(project);
  if (!accessToken) {
    throw new PublicError(
      project.github?.installationId
        ? "Could not mint a GitHub App installation token for this repository."
        : "This project is not connected via the GitHub App. Reconnect it from Settings.",
      "connect",
    );
  }

  const { owner, repo } = parseOwnerRepo(fullName);
  const ref = refForProjectCheckout(project);
  const octokit = createOctokit(accessToken);
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: filePath,
      ...(ref ? { ref } : {}),
    });
    if (Array.isArray(data) || data.type !== "file") {
      throw new PublicError(
        `Not a file in ${fullName}: ${filePath}`,
        "connect",
      );
    }
    if (data.encoding !== "base64" || typeof data.content !== "string") {
      throw new PublicError(
        `Could not read the full contents of ${filePath} (file too large?).`,
        "connect",
      );
    }
    return Buffer.from(data.content, "base64").toString("utf8");
  } catch (error) {
    if (error instanceof PublicError) throw error;
    throw new PublicError(
      octokitErrorMessage(error, `Could not read ${filePath} from ${fullName}`),
      "connect",
    );
  }
}

/**
 * Materialises one repository file at its project-relative path in a temp
 * directory, then deletes it. The AST scan and edit application only need the
 * Finding's file, so patch generation must not pay for a clone.
 */
export async function withProjectFileWorkspace<T>(
  project: Project,
  filePath: string,
  fn: (rootPath: string) => Promise<T>,
): Promise<T> {
  if (isE2EHarnessEnabled()) {
    return withFixtureCheckout(fn);
  }

  const text = await readProjectFile(project, filePath);
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "complyloop-file-"));
  try {
    const absolute = resolveInside(rootPath, filePath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, text, "utf8");
    return await fn(rootPath);
  } finally {
    fs.rmSync(rootPath, { recursive: true, force: true });
  }
}

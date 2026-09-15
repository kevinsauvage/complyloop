/**
 * AST orchestration entry (stage 1 of the analysis pipeline): file discovery
 * (`source-files.ts`) → per-file checks (`checks/registry.ts` + jsx-a11y) →
 * `ScanResult`. Engines stay behind this entry — server code never imports
 * `checks/*` internals. Shared AST leaves (`parse.ts`,
 * `a11y-aria.ts`) are engine-agnostic. See `packages/analysis-core/README.md`.
 */
import fs from "node:fs";
import path from "node:path";

import { allChecks } from "./checks/registry.ts";
import { lintJsxA11y } from "./jsx-a11y-scan.ts";
import { parseSource } from "./parse.ts";
import { listSourceFiles } from "./source-files.ts";
import type { RawFinding } from "./types.ts";
import { resolveInside } from "./workspace-path.ts";

export interface ScanResult {
  findings: RawFinding[];
  filesScanned: number;
  scanMode: "full" | "scoped";
}

/**
 * Resolves `filePath` (relative to `rootPath`) to an absolute path,
 * returning `null` if it escapes `rootPath` or doesn't exist on disk.
 */
function resolveExistingFile(
  rootPath: string,
  filePath: string,
): string | null {
  try {
    const absolute = resolveInside(rootPath, filePath);
    return fs.existsSync(absolute) ? absolute : null;
  } catch {
    return null;
  }
}

/** Runs every check against a single file. `filePath` is relative to `rootPath`. */
export function scanFile(rootPath: string, filePath: string): RawFinding[] {
  const absolute = resolveExistingFile(rootPath, filePath);
  if (!absolute) return [];
  const text = fs.readFileSync(absolute, "utf8");
  const parsed = parseSource(filePath, text);
  return [
    ...allChecks.flatMap((check) => check.run(parsed)),
    ...lintJsxA11y(parsed),
  ];
}

export function scanProject(rootPath: string): ScanResult {
  const absolutePaths = listSourceFiles(rootPath, "jsx");
  const findings = absolutePaths.flatMap((absolutePath) =>
    scanFile(rootPath, path.relative(rootPath, absolutePath)),
  );
  return {
    findings,
    filesScanned: absolutePaths.length,
    scanMode: "full",
  };
}

/**
 * Scans only the given relative JSX/TSX paths (and skips missing deleted files).
 * Used for continuous re-assessment when a snapshot diff exists.
 */
export function scanChangedFiles(
  rootPath: string,
  relativePaths: ReadonlyArray<string>,
): ScanResult {
  const jsxPaths = [
    ...new Set(
      relativePaths.filter((filePath) => /\.(tsx|jsx)$/i.test(filePath)),
    ),
  ].sort();
  const findings = jsxPaths.flatMap((filePath) => scanFile(rootPath, filePath));
  const existing = jsxPaths.filter(
    (filePath) => resolveExistingFile(rootPath, filePath) !== null,
  );
  return {
    findings,
    filesScanned: existing.length,
    scanMode: "scoped",
  };
}

import fs from "node:fs";
import path from "node:path";
import { listSourceFiles } from "./source-files.js";
import { allChecks } from "./checks/registry.js";
import { lintJsxA11y } from "./jsx-a11y-scan.js";
import { parseSource } from "./parse.js";
import type { RawFinding } from "./types.js";
import { resolveInside } from "./workspace-path.js";

export interface ScanResult {
  findings: RawFinding[];
  filesScanned: number;
  scanMode: "full" | "scoped";
}

/** Runs every check against a single file. `filePath` is relative to `rootPath`. */
export function scanFile(rootPath: string, filePath: string): RawFinding[] {
  let absolute: string;
  try {
    absolute = resolveInside(rootPath, filePath);
  } catch {
    return [];
  }
  if (!fs.existsSync(absolute)) return [];
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
  const existing = jsxPaths.filter((filePath) => {
    try {
      return fs.existsSync(resolveInside(rootPath, filePath));
    } catch {
      return false;
    }
  });
  return {
    findings,
    filesScanned: existing.length,
    scanMode: "scoped",
  };
}

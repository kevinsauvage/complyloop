import fs from "node:fs";
import path from "node:path";
import { listSourceFiles } from "./source-files";
import { allChecks } from "./checks/registry";
import { parseSource } from "./parse";
import type { RawFinding } from "./types";

export interface ScanResult {
  findings: RawFinding[];
  filesScanned: number;
  scanMode: "full" | "scoped";
}

/** Runs every check against a single file. `filePath` is relative to `rootPath`. */
export function scanFile(rootPath: string, filePath: string): RawFinding[] {
  const absolute = path.join(rootPath, filePath);
  if (!fs.existsSync(absolute)) return [];
  const text = fs.readFileSync(absolute, "utf8");
  const parsed = parseSource(filePath, text);
  return allChecks.flatMap((check) => check.run(parsed));
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
  const existing = jsxPaths.filter((filePath) =>
    fs.existsSync(path.join(rootPath, filePath)),
  );
  return {
    findings,
    filesScanned: existing.length,
    scanMode: "scoped",
  };
}

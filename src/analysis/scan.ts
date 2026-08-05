import fs from "node:fs";
import path from "node:path";
import { listSourceFiles } from "./source-files";
import { allChecks } from "./checks/registry";
import { parseSource } from "./parse";
import type { RawFinding } from "./types";

export interface ScanResult {
  findings: RawFinding[];
  filesScanned: number;
}

/** Runs every check against a single file. `filePath` is relative to `rootPath`. */
export function scanFile(rootPath: string, filePath: string): RawFinding[] {
  const text = fs.readFileSync(path.join(rootPath, filePath), "utf8");
  const parsed = parseSource(filePath, text);
  return allChecks.flatMap((check) => check.run(parsed));
}

export function scanProject(rootPath: string): ScanResult {
  const absolutePaths = listSourceFiles(rootPath, "jsx");
  const findings = absolutePaths.flatMap((absolutePath) =>
    scanFile(rootPath, path.relative(rootPath, absolutePath)),
  );
  return { findings, filesScanned: absolutePaths.length };
}

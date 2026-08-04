import fs from "node:fs";
import path from "node:path";
import { allChecks } from "./checks/registry";
import { parseSource } from "./parse";
import type { RawFinding } from "./types";

const SOURCE_EXTENSIONS = new Set([".tsx", ".jsx"]);
const IGNORED_DIRECTORIES = new Set(["node_modules", ".next", ".git", "dist", "out"]);

export interface ScanResult {
  findings: RawFinding[];
  filesScanned: number;
}

function collectSourceFiles(rootPath: string): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) walk(path.join(dir, entry.name));
        continue;
      }
      if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(path.join(dir, entry.name));
      }
    }
  };
  walk(rootPath);
  return files.sort();
}

/** Runs every check against a single file. `filePath` is relative to `rootPath`. */
export function scanFile(rootPath: string, filePath: string): RawFinding[] {
  const text = fs.readFileSync(path.join(rootPath, filePath), "utf8");
  const parsed = parseSource(filePath, text);
  return allChecks.flatMap((check) => check.run(parsed));
}

export function scanProject(rootPath: string): ScanResult {
  const absolutePaths = collectSourceFiles(rootPath);
  const findings = absolutePaths.flatMap((absolutePath) =>
    scanFile(rootPath, path.relative(rootPath, absolutePath)),
  );
  return { findings, filesScanned: absolutePaths.length };
}

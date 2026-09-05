/**
 * CI gate core: scan a project tree and report violation findings.
 * Pure aside from filesystem reads — the entry (`check.ts`) owns process.exit.
 */
import fs from "node:fs";
import path from "node:path";
import { scanProject } from "@complyloop/analysis-core/scan";
import { formatLocationRef } from "@complyloop/analysis-core/contract/location";

export const CHECK_HELP = `Usage: npx complyloop-check [path]

Scans a React/TSX tree for accessibility violations (ComplyLoop CI gate).
Defaults to the current working directory when no path is given.

Options:
  -h, --help   Show this help and exit.

Exit codes:
  0  No violations (warnings do not fail the gate).
  1  At least one violation finding.
  2  The given path is not a directory.`;

export interface CheckIo {
  log: (line: string) => void;
  error: (line: string) => void;
}

/** Runs the check and returns the process exit code. */
export function runCheck(argv: readonly string[], io: CheckIo): number {
  const targetArg = argv[0];
  if (targetArg === "--help" || targetArg === "-h") {
    io.log(CHECK_HELP);
    return 0;
  }

  const rootPath = path.resolve(targetArg ?? process.cwd());
  if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
    io.error(`Not a directory: ${rootPath}`);
    return 2;
  }

  const { findings, filesScanned } = scanProject(rootPath);
  const violations = findings.filter((finding) => finding.kind === "violation");
  const warnings = findings.filter((finding) => finding.kind === "warning");

  io.log(`ComplyLoop check: scanned ${filesScanned} file(s) in ${rootPath}`);
  io.log(`  ${violations.length} violation(s), ${warnings.length} warning(s)`);

  for (const finding of violations) {
    io.log(
      `  FAIL ${finding.checkId} ${formatLocationRef(finding.location)} — ${finding.reason}`,
    );
  }
  for (const finding of warnings) {
    io.log(
      `  WARN ${finding.checkId} ${formatLocationRef(finding.location)} — ${finding.reason}`,
    );
  }

  return violations.length > 0 ? 1 : 0;
}

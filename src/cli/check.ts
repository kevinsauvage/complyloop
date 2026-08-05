/**
 * CI gate: scan a project tree and exit non-zero when violation findings exist.
 *
 * Usage:
 *   npx complyloop-check [path]
 *   npm run check -- [path]
 *
 * Defaults to the current working directory when no path is given.
 */
import fs from "node:fs";
import path from "node:path";
import { scanProject } from "../analysis/scan";

function main(): void {
  const targetArg = process.argv[2];
  const rootPath = path.resolve(targetArg ?? process.cwd());

  if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
    console.error(`Not a directory: ${rootPath}`);
    process.exit(2);
  }

  const { findings, filesScanned } = scanProject(rootPath);
  const violations = findings.filter((finding) => finding.kind === "violation");
  const warnings = findings.filter((finding) => finding.kind === "warning");

  console.log(
    `ComplyLoop check: scanned ${filesScanned} file(s) in ${rootPath}`,
  );
  console.log(
    `  ${violations.length} violation(s), ${warnings.length} warning(s)`,
  );

  for (const finding of violations) {
    console.log(
      `  FAIL ${finding.checkId} ${finding.location.filePath}:${finding.location.line} — ${finding.reason}`,
    );
  }
  for (const finding of warnings) {
    console.log(
      `  WARN ${finding.checkId} ${finding.location.filePath}:${finding.location.line} — ${finding.reason}`,
    );
  }

  if (violations.length > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main();

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scanProject } from "@complyloop/analysis-core/scan";
import { CHECK_HELP, runCheck, type CheckIo } from "./run-check";

const testdataDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../testdata",
);

describe("complyloop-check testdata", () => {
  it("flags deliberate AST violations for new heuristic checks", () => {
    const { findings } = scanProject(testdataDir);
    const checkIds = new Set(findings.map((finding) => finding.checkId));

    expect(checkIds.has("img-alt")).toBe(true);
    expect(checkIds.has("error-prevention")).toBe(true);
    expect(checkIds.has("captcha-alternative")).toBe(true);
    expect(checkIds.has("link-explicit-heuristic")).toBe(true);
    expect(checkIds.has("accessible-auth-enhanced")).toBe(true);
  });
});

function collectIo(): CheckIo & { logs: string[]; errors: string[] } {
  const logs: string[] = [];
  const errors: string[] = [];
  return {
    logs,
    errors,
    log: (line) => logs.push(line),
    error: (line) => errors.push(line),
  };
}

describe("runCheck exit codes", () => {
  it("prints help and exits 0 for --help / -h", () => {
    for (const flag of ["--help", "-h"]) {
      const io = collectIo();
      expect(runCheck([flag], io)).toBe(0);
      expect(io.logs.join("\n")).toContain("Exit codes:");
      expect(io.logs.join("\n")).toBe(CHECK_HELP);
    }
  });

  it("exits 2 for a path that is not a directory", () => {
    const io = collectIo();
    expect(runCheck(["/definitely/not/a/real/dir"], io)).toBe(2);
    expect(io.errors[0]).toMatch(/Not a directory/);
  });

  it("exits 1 when the tree contains violations", () => {
    const io = collectIo();
    expect(runCheck([testdataDir], io)).toBe(1);
    expect(io.logs.some((line) => line.startsWith("  FAIL "))).toBe(true);
  });

  it("exits 0 on a clean tree", () => {
    const cleanDir = fs.mkdtempSync(path.join(os.tmpdir(), "complyloop-check-"));
    try {
      fs.writeFileSync(
        path.join(cleanDir, "Clean.tsx"),
        'export function Clean() {\n  return <img src="/logo.png" alt="Logo" />;\n}\n',
      );
      const io = collectIo();
      expect(runCheck([cleanDir], io)).toBe(0);
    } finally {
      fs.rmSync(cleanDir, { recursive: true, force: true });
    }
  });
});

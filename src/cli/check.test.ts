import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scanProject } from "@complyloop/analysis-core/scan";

const testdataDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../packages/check/testdata",
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

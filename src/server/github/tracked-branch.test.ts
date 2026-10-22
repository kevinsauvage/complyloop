import { describe, expect, it } from "vitest";

import { effectiveBranch } from "./tracked-branch";

describe("effectiveBranch", () => {
  it("prefers the tracked branch", () => {
    expect(
      effectiveBranch({ defaultBranch: "main", trackedBranch: "develop" }),
    ).toBe("develop");
  });

  it("falls back to the default branch, then undefined", () => {
    expect(effectiveBranch({ defaultBranch: "main" })).toBe("main");
    expect(effectiveBranch({ defaultBranch: "main", trackedBranch: "" })).toBe(
      "main",
    );
    expect(effectiveBranch(undefined)).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { presetScopeAction } from "./preset-scope-action";

const full = { controlIds: ["a", "b", "c"] };
const subset = { controlIds: ["a"] };

describe("presetScopeAction", () => {
  it("marks a covering preset as current when scope is implicit all", () => {
    expect(
      presetScopeAction(full, new Set(["a", "b", "c"]), false),
    ).toEqual({ kind: "current" });
  });

  it("warns that a subset will replace implicit all-controls scope", () => {
    expect(
      presetScopeAction(subset, new Set(["a", "b", "c"]), false),
    ).toEqual({ kind: "narrow", controlCount: 1 });
  });

  it("treats a fully included preset as already in explicit scope", () => {
    expect(
      presetScopeAction(subset, new Set(["a", "b"]), true),
    ).toEqual({ kind: "in_scope" });
  });

  it("counts remaining controls to add to an explicit scope", () => {
    expect(presetScopeAction(full, new Set(["a"]), true)).toEqual({
      kind: "add",
      remaining: 2,
    });
  });
});

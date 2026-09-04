import { describe, expect, it } from "vitest";
import { mergeAdapterControls } from "@/adapters/registry";
import { rgaaFramework } from "@/adapters/rgaa/controls";
import { emptyDb } from "./db";

function ensureSeededInMemory(db: ReturnType<typeof emptyDb>): boolean {
  if (db.frameworks.length === 0) {
    const merged = mergeAdapterControls([], []);
    db.frameworks.push(...merged.frameworks);
    db.controls.push(...merged.controls);
    return true;
  }
  const merged = mergeAdapterControls(db.frameworks, db.controls);
  if (!merged.changed) return false;
  db.frameworks = merged.frameworks;
  db.controls = merged.controls;
  return true;
}

describe("catalog merge (seed)", () => {
  it("seeds frameworks and controls into an empty db", () => {
    const db = emptyDb();
    expect(ensureSeededInMemory(db)).toBe(true);
    expect(db.frameworks.some((framework) => framework.id === rgaaFramework.id)).toBe(
      true,
    );
    expect(db.controls.some((control) => control.id === "ctl-img-alt")).toBe(true);
    expect(ensureSeededInMemory(db)).toBe(false);
  });

  it("merges adapter controls without wiping a custom control", () => {
    const db = emptyDb();
    db.frameworks.push({ ...rgaaFramework });
    db.controls.push({
      id: "ctl-custom-seed",
      frameworkId: "fw-custom",
      code: "CUST-1",
      secondaryCode: "Custom",
      title: "Custom control",
      description: "Manual review only",
      checkId: null,
    });

    expect(ensureSeededInMemory(db)).toBe(true);
    expect(db.controls.some((control) => control.id === "ctl-custom-seed")).toBe(
      true,
    );
    expect(db.controls.some((control) => control.id === "ctl-img-alt")).toBe(true);
  });
});

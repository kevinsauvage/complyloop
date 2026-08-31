import { describe, expect, it } from "vitest";
import { rgaaFramework } from "@/adapters/rgaa/controls";
import { emptyDb } from "./db";
import { ensureSeeded } from "./seed";

describe("ensureSeeded", () => {
  it("seeds frameworks and controls into an empty db", () => {
    const db = emptyDb();
    expect(ensureSeeded(db)).toBe(true);
    expect(db.frameworks.some((framework) => framework.id === rgaaFramework.id)).toBe(
      true,
    );
    expect(db.controls.some((control) => control.id === "ctl-img-alt")).toBe(true);
    expect(ensureSeeded(db)).toBe(false);
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

    expect(ensureSeeded(db)).toBe(true);
    expect(db.controls.some((control) => control.id === "ctl-custom-seed")).toBe(
      true,
    );
    expect(db.controls.some((control) => control.id === "ctl-img-alt")).toBe(true);
  });
});

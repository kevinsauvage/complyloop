import { describe, expect, it } from "vitest";
import { rgaaFramework } from "@/adapters/rgaa/controls";
import type { Project } from "@/core/project-types";
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

  it("purges retired non-GitHub projects while retaining evidence", () => {
    const db = emptyDb();
    ensureSeeded(db);
    const legacyProject = {
      id: "legacy-local",
      name: "Old local",
      source: "local",
      createdAt: "2026-01-01T00:00:00.000Z",
    } as unknown as Project;
    db.projects.push(legacyProject);
    db.requirements.push({
      id: "req-legacy",
      projectId: "legacy-local",
      controlId: "ctl-img-alt",
      status: "failed",
      determination: "automated",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    db.evidence.push({
      id: "ev-1",
      at: "2026-01-01T00:00:00.000Z",
      kind: "assessment_completed",
      summary: "kept",
      projectId: "legacy-local",
    });

    expect(ensureSeeded(db)).toBe(true);
    expect(db.projects.some((project) => project.id === "legacy-local")).toBe(
      false,
    );
    expect(db.requirements).toHaveLength(0);
    expect(db.evidence).toHaveLength(1);
  });
});

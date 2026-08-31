import { describe, expect, it } from "vitest";
import { rgaaFramework } from "@/adapters/rgaa/controls";
import { emptyDb } from "./db";
import { refreshRequirementStatuses } from "./assessment-status";

describe("refreshRequirementStatuses runtime-only", () => {
  it("does not pass color-contrast when the runtime audit did not run", () => {
    const db = emptyDb();
    db.frameworks.push(rgaaFramework);
    db.controls.push({
      id: "ctl-color-contrast",
      frameworkId: rgaaFramework.id,
      code: "WCAG 1.4.3",
      secondaryCode: "RGAA 3.2",
      title: "Text contrast meets 4.5:1",
      description: "Rendered contrast.",
      checkId: "color-contrast",
    });
    db.projects.push({
      id: "p1",
      name: "App",
      source: "github",
      createdAt: new Date().toISOString(),
    });

    refreshRequirementStatuses(db, "p1", { runtimeRan: false });

    expect(
      db.requirements.find((requirement) => requirement.controlId === "ctl-color-contrast")
        ?.status,
    ).toBe("unable_to_verify");
  });

  it("passes color-contrast when runtime ran and there are no findings", () => {
    const db = emptyDb();
    db.frameworks.push(rgaaFramework);
    db.controls.push({
      id: "ctl-color-contrast",
      frameworkId: rgaaFramework.id,
      code: "WCAG 1.4.3",
      secondaryCode: "RGAA 3.2",
      title: "Text contrast meets 4.5:1",
      description: "Rendered contrast.",
      checkId: "color-contrast",
    });
    db.projects.push({
      id: "p1",
      name: "App",
      source: "github",
      createdAt: new Date().toISOString(),
    });

    refreshRequirementStatuses(db, "p1", { runtimeRan: true });

    expect(
      db.requirements.find((requirement) => requirement.controlId === "ctl-color-contrast")
        ?.status,
    ).toBe("passed");
  });

  it("does not pass axe-only controls when the runtime audit did not run", () => {
    const db = emptyDb();
    db.frameworks.push(rgaaFramework);
    db.controls.push({
      id: "ctl-table-headers",
      frameworkId: rgaaFramework.id,
      code: "RGAA 5.1",
      secondaryCode: "WCAG 1.3.1",
      title: "Data tables have headers",
      description: "Rendered table headers.",
      checkId: "table-headers",
    });
    db.projects.push({
      id: "p1",
      name: "App",
      source: "github",
      createdAt: new Date().toISOString(),
    });

    refreshRequirementStatuses(db, "p1", { runtimeRan: false });

    expect(
      db.requirements.find((requirement) => requirement.controlId === "ctl-table-headers")
        ?.status,
    ).toBe("unable_to_verify");
  });

  it("passes axe-only controls when runtime ran and there are no findings", () => {
    const db = emptyDb();
    db.frameworks.push(rgaaFramework);
    db.controls.push({
      id: "ctl-table-headers",
      frameworkId: rgaaFramework.id,
      code: "RGAA 5.1",
      secondaryCode: "WCAG 1.3.1",
      title: "Data tables have headers",
      description: "Rendered table headers.",
      checkId: "table-headers",
    });
    db.projects.push({
      id: "p1",
      name: "App",
      source: "github",
      createdAt: new Date().toISOString(),
    });

    refreshRequirementStatuses(db, "p1", { runtimeRan: true });

    expect(
      db.requirements.find((requirement) => requirement.controlId === "ctl-table-headers")
        ?.status,
    ).toBe("passed");
  });
});

import "@/test-fixtures/register-action-workspace-mock";

import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  OrgMembership,
  Project,
} from "@complyloop/analysis-core/contract/project-types";

import {
  clearProjectWritePayloads,
  mockProjectWrite,
  projectWritePayload,
} from "@/test-fixtures/action-workspace-mocks";
import { testProject } from "@/test-fixtures/project";
import { testWorkspace } from "@/test-fixtures/workspace";

import { initialActionState } from "../action-state";
import { setDefaultPresetAction } from "./project-preset";

function formWith(presetId: string): FormData {
  const form = new FormData();
  form.set("presetId", presetId);
  return form;
}

function mockWrite(project: Project, role: OrgMembership["role"] = "admin") {
  const workspace = testWorkspace({
    role,
    project,
    findings: [],
    remediations: [],
  });
  mockProjectWrite(workspace);
  return workspace;
}

afterEach(() => {
  vi.clearAllMocks();
  clearProjectWritePayloads();
});

describe("setDefaultPresetAction", () => {
  it("requires a preset id", async () => {
    const result = await setDefaultPresetAction(
      initialActionState,
      new FormData(),
    );
    expect((result.ok ? null : result.message)).toMatch(/framework preset is required/);
  });

  it("denies viewers", async () => {
    mockWrite(testProject({ orgId: "org-1" }), "viewer");
    const result = await setDefaultPresetAction(
      initialActionState,
      formWith("preset-wcag-aa"),
    );
    expect((result.ok ? null : result.message)).toMatch(/Not allowed/);
  });

  it("saves the default preset for admins", async () => {
    const project = testProject({ orgId: "org-1" });
    mockWrite(project);

    const result = await setDefaultPresetAction(
      initialActionState,
      formWith("preset-wcag-aa"),
    );

    expect(result.message).toBe("Default assessment preset saved");
    expect(project.defaultPresetId).toBe("preset-wcag-aa");
    expect(projectWritePayload()?.project).toBe(project);
  });

  it("records evidence when the default changes", async () => {
    mockWrite(testProject({ orgId: "org-1" }));
    await setDefaultPresetAction(
      initialActionState,
      formWith("preset-wcag-aa"),
    );
    expect(
      projectWritePayload()?.evidence?.some(
        (record) =>
          record.kind === "requirements_imported" &&
          record.summary.includes("Default assessment preset"),
      ),
    ).toBe(true);
  });

  it("is a no-op when the default is unchanged", async () => {
    const project = testProject({
      orgId: "org-1",
      defaultPresetId: "preset-wcag-aa",
    });
    mockWrite(project);

    const result = await setDefaultPresetAction(
      initialActionState,
      formWith("preset-wcag-aa"),
    );

    expect(result.message).toBe("This is already the default preset.");
    expect(projectWritePayload()?.evidence).toBeUndefined();
  });

  it("rejects an unknown preset", async () => {
    mockWrite(testProject({ orgId: "org-1" }));
    const result = await setDefaultPresetAction(
      initialActionState,
      formWith("nope"),
    );
    expect((result.ok ? null : result.message)).toMatch(/Unknown framework preset/);
  });
});

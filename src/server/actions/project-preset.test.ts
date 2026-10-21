import "@/test-fixtures/register-action-workspace-mock";
import "@/test-fixtures/register-repo-mock";

import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  OrgMembership,
  Project,
} from "@complyloop/analysis-core/contract/project-types";

import { initialActionState } from "@/core/actions/action-state";
import {
  clearRecordedWrites,
  mockProjectTx,
  recordedWrites,
} from "@/test-fixtures/action-workspace-mocks";
import { testProject } from "@/test-fixtures/project";
import { testWorkspace } from "@/test-fixtures/workspace";

import { setDefaultPresetAction } from "./project-preset";

function formWith(target: Project, presetId?: string): FormData {
  const form = new FormData();
  form.set("projectId", target.id);
  if (presetId !== undefined) form.set("presetId", presetId);
  return form;
}

function mockWrite(project: Project, role: OrgMembership["role"] = "admin") {
  const workspace = testWorkspace({
    role,
    project,
    findings: [],
    remediations: [],
  });
  mockProjectTx(workspace);
  return workspace;
}

afterEach(() => {
  vi.clearAllMocks();
  clearRecordedWrites();
});

describe("setDefaultPresetAction", () => {
  it("requires a preset id", async () => {
    const project = testProject({ orgId: "org-1" });
    mockWrite(project);

    const result = await setDefaultPresetAction(
      initialActionState,
      formWith(project),
    );

    expect(result.ok ? null : result.message).toMatch(
      /framework preset is required/,
    );
  });

  it("denies viewers", async () => {
    const project = testProject({ orgId: "org-1" });
    mockWrite(project, "viewer");
    const result = await setDefaultPresetAction(
      initialActionState,
      formWith(project, "preset-wcag-aa"),
    );
    expect(result.ok ? null : result.message).toMatch(/Not allowed/);
  });

  it("saves the default preset for admins", async () => {
    const project = testProject({ orgId: "org-1" });
    mockWrite(project);

    const result = await setDefaultPresetAction(
      initialActionState,
      formWith(project, "preset-wcag-aa"),
    );

    expect(result.message).toBe("Default assessment preset saved");
    expect(recordedWrites().project?.defaultPresetId).toBe("preset-wcag-aa");
    expect(recordedWrites().project?.id).toBe(project.id);
  });

  it("records evidence when the default changes", async () => {
    const project = testProject({ orgId: "org-1" });
    mockWrite(project);
    await setDefaultPresetAction(
      initialActionState,
      formWith(project, "preset-wcag-aa"),
    );
    expect(
      recordedWrites()?.evidence?.some(
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
      formWith(project, "preset-wcag-aa"),
    );

    expect(result.message).toBe("This is already the default preset.");
    expect(recordedWrites().evidence).toHaveLength(0);
  });

  it("rejects an unknown preset", async () => {
    const project = testProject({ orgId: "org-1" });
    mockWrite(project);
    const result = await setDefaultPresetAction(
      initialActionState,
      formWith(project, "nope"),
    );
    expect(result.ok ? null : result.message).toMatch(
      /Unknown framework preset/,
    );
  });
});

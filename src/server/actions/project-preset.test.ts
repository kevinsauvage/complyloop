import "@/test-fixtures/register-action-workspace-mock";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrgMembership } from "@complyloop/domain/project-types";
import { actionWorkspaceMocks } from "@/test-fixtures/action-workspace-mocks";
import { testProject } from "@/test-fixtures/project";
import { testWorkspace } from "@/test-fixtures/workspace";
import { emptyActionMessageState } from "../action-state";
import { setDefaultPresetAction } from "./project-preset";

const { withProjectWrite } = actionWorkspaceMocks;
const setDefaultPreset = vi.hoisted(() => vi.fn());

vi.mock("../project-preset", () => ({
  setDefaultPreset: (...args: unknown[]) => setDefaultPreset(...args),
}));

const project = testProject({ orgId: "org-1" });

function workspaceFor(role: OrgMembership["role"]) {
  return testWorkspace({
    role,
    project,
    findings: [],
    remediations: [],
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("setDefaultPresetAction", () => {
  it("requires a preset id", async () => {
    const result = await setDefaultPresetAction(
      emptyActionMessageState,
      new FormData(),
    );
    expect(result.error).toMatch(/framework preset is required/);
  });

  it("denies viewers", async () => {
    withProjectWrite.mockImplementation(async (_scope, fn) =>
      fn(workspaceFor("viewer")),
    );
    const form = new FormData();
    form.set("presetId", "preset-wcag-aa");
    const result = await setDefaultPresetAction(emptyActionMessageState, form);
    expect(result.error).toMatch(/Not allowed/);
  });

  it("saves the default preset for admins", async () => {
    const workspace = workspaceFor("admin");
    withProjectWrite.mockImplementation(async (_scope, fn) => fn(workspace));
    setDefaultPreset.mockReturnValue({ changed: true });
    const form = new FormData();
    form.set("presetId", "preset-wcag-aa");

    const result = await setDefaultPresetAction(emptyActionMessageState, form);

    expect(result.message).toBe("Default assessment preset saved");
    expect(setDefaultPreset).toHaveBeenCalledWith(
      workspace.db,
      project,
      "preset-wcag-aa",
    );
  });
});

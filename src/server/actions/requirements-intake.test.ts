import "@/test-fixtures/register-action-workspace-mock";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrgMembership } from "@/core/project-types";
import { actionWorkspaceMocks } from "@/test-fixtures/action-workspace-mocks";
import { testProject } from "@/test-fixtures/project";
import { testWorkspace } from "@/test-fixtures/workspace";
import { emptyActionMessageState } from "../action-state";
import { applyFrameworkPresetAction } from "./requirements-intake";

const { withWorkspaceWrite } = actionWorkspaceMocks;
const applyFrameworkPreset = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("../requirements-intake", () => ({
  applyFrameworkPreset: (...args: unknown[]) => applyFrameworkPreset(...args),
}));

vi.mock("./shared", async () => {
  const actual = await vi.importActual<typeof import("./shared")>("./shared");
  return {
    ...actual,
    refresh: () => refresh(),
  };
});

const project = testProject({ orgId: "org-1" });

function workspaceFor(role: OrgMembership["role"]) {
  return testWorkspace({
    role,
    project,
    findings: [],
    remediations: [],
    db: {
      controls: [
        {
          id: "c1",
          frameworkId: "fw",
          code: "1",
          title: "T",
          description: "D",
          checkId: null,
          secondaryCode: "",
        },
      ],
    },
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("applyFrameworkPresetAction", () => {
  it("requires a preset id", async () => {
    const result = await applyFrameworkPresetAction(
      emptyActionMessageState,
      new FormData(),
    );
    expect(result.error).toMatch(/framework preset is required/);
  });

  it("denies viewers", async () => {
    withWorkspaceWrite.mockImplementation(async (fn) =>
      fn(workspaceFor("viewer")),
    );
    const form = new FormData();
    form.set("presetId", "preset-rgaa-full");
    const result = await applyFrameworkPresetAction(
      emptyActionMessageState,
      form,
    );
    expect(result.error).toMatch(/Not allowed/);
  });

  it("sets the assessment target for members", async () => {
    const workspace = workspaceFor("member");
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));
    applyFrameworkPreset.mockReturnValue({ changed: true });
    const form = new FormData();
    form.set("presetId", "preset-rgaa-full");

    const result = await applyFrameworkPresetAction(
      emptyActionMessageState,
      form,
    );

    expect(result.message).toBe("Assessment target updated");
    expect(applyFrameworkPreset).toHaveBeenCalledWith(
      workspace.db,
      project,
      "preset-rgaa-full",
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reports when the target is already selected", async () => {
    withWorkspaceWrite.mockImplementation(async (fn) =>
      fn(workspaceFor("member")),
    );
    applyFrameworkPreset.mockReturnValue({ changed: false });
    const form = new FormData();
    form.set("presetId", "preset-rgaa-full");

    const result = await applyFrameworkPresetAction(
      emptyActionMessageState,
      form,
    );

    expect(result.message).toBe("This is already the assessment target.");
  });
});

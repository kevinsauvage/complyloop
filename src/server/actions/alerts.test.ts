import "@/test-fixtures/register-action-workspace-mock";

import { afterEach, describe, expect, it, vi } from "vitest";

import { initialActionState } from "@/core/action-state";
import {
  actionAuthMocks,
  actionWorkspaceMocks,
} from "@/test-fixtures/action-workspace-mocks";
import { testMembership } from "@/test-fixtures/membership";
import { testProject } from "@/test-fixtures/project";

import { markAlertReadAction } from "./alerts";

const { withProjectLock, getWorkspace } = actionWorkspaceMocks;
const markAlertRead = vi.hoisted(() => vi.fn());
const getAlertById = vi.hoisted(() => vi.fn());
const getProjectById = vi.hoisted(() => vi.fn());
const listMembershipsForOrgs = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());

vi.mock("@complyloop/db/postgres", () => ({
  getDrizzle: async () => ({ transaction }),
}));

vi.mock("@complyloop/db/repo/alerts", () => ({
  markAlertRead: (...args: unknown[]) => markAlertRead(...args),
  getAlertById: (...args: unknown[]) => getAlertById(...args),
}));

vi.mock("@complyloop/db/repo/projects", () => ({
  getProjectById: (...args: unknown[]) => getProjectById(...args),
}));

vi.mock("@complyloop/db/repo/orgs", () => ({
  listMembershipsForOrgs: (...args: unknown[]) =>
    listMembershipsForOrgs(...args),
}));

const project = testProject({ orgId: "org-1" });

afterEach(() => {
  vi.clearAllMocks();
});

describe("markAlertReadAction", () => {
  const alert = {
    id: "alert-1",
    projectId: "p1",
    kind: "compliance_regression" as const,
    summary: "Regressed",
    at: "2026-01-01T00:00:00.000Z",
    read: false,
  };

  function signIn(): void {
    actionAuthMocks.auth.mockResolvedValue({
      user: { id: "user-1", login: "alice" },
    });
  }

  it("marks a project alert as read without a workspace load", async () => {
    signIn();
    getAlertById.mockResolvedValue(alert);
    getProjectById.mockResolvedValue(project);
    listMembershipsForOrgs.mockResolvedValue([
      testMembership("member", { orgId: project.orgId, userId: "user-1" }),
    ]);
    withProjectLock.mockImplementation(async (_id, fn) => fn({}));
    const form = new FormData();
    form.set("alertId", "alert-1");

    const result = await markAlertReadAction(initialActionState, form);
    expect(result.message).toBe("Alert marked as read.");
    expect(markAlertRead).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "alert-1", read: false }),
    );
    expect(getWorkspace).not.toHaveBeenCalled();
  });

  it("rejects a viewer without membership in the alert's org", async () => {
    signIn();
    getAlertById.mockResolvedValue(alert);
    getProjectById.mockResolvedValue(project);
    listMembershipsForOrgs.mockResolvedValue([]);
    const form = new FormData();
    form.set("alertId", "alert-1");

    const result = await markAlertReadAction(initialActionState, form);
    expect(result.ok ? null : result.message).toMatch(/Not allowed/);
    expect(markAlertRead).not.toHaveBeenCalled();
  });

  it("rejects an unknown alert id", async () => {
    signIn();
    getAlertById.mockResolvedValue(undefined);
    const form = new FormData();
    form.set("alertId", "missing");
    const result = await markAlertReadAction(initialActionState, form);
    expect(result.ok ? null : result.message).toMatch(/Unknown alert/);
  });

  it("requires an alert id", async () => {
    signIn();
    const result = await markAlertReadAction(
      initialActionState,
      new FormData(),
    );
    expect(result.ok ? null : result.message).toMatch(/Unknown alert/);
  });
});

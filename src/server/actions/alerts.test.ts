import "@/test-fixtures/register-action-workspace-mock";

import { afterEach, describe, expect, it, vi } from "vitest";

import { initialActionState } from "@/core/actions/action-state";
import {
  actionAuthMocks,
  actionWorkspaceMocks,
} from "@/test-fixtures/action-workspace-mocks";
import { testMembership } from "@/test-fixtures/membership";
import { testProject } from "@/test-fixtures/project";
import { testWorkspace } from "@/test-fixtures/workspace";

import { markAlertReadAction, markAllAlertsReadAction } from "./alerts";

const { withProjectLock, getWorkspace } = actionWorkspaceMocks;
const markAlertReadById = vi.hoisted(() => vi.fn());
const getAlertById = vi.hoisted(() => vi.fn());
const getProjectById = vi.hoisted(() => vi.fn());
const listMembershipsForOrgs = vi.hoisted(() => vi.fn());
const listAlertsForProject = vi.hoisted(() => vi.fn());
const markAllProjectAlertsRead = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());

vi.mock("@complyloop/db/postgres", () => ({
  getDrizzle: async () => ({ transaction }),
}));

vi.mock("@complyloop/db/repo/alerts", () => ({
  markAlertReadById: (...args: unknown[]) => markAlertReadById(...args),
  getAlertById: (...args: unknown[]) => getAlertById(...args),
  listAlertsForProject: (...args: unknown[]) => listAlertsForProject(...args),
  markAllProjectAlertsRead: (...args: unknown[]) =>
    markAllProjectAlertsRead(...args),
}));

vi.mock("@complyloop/db/repo/projects", () => ({
  getProjectById: (...args: unknown[]) => getProjectById(...args),
}));

vi.mock("@complyloop/db/repo/orgs", () => ({
  listMembershipsForOrgs: (...args: unknown[]) =>
    listMembershipsForOrgs(...args),
}));

const project = testProject({ orgId: "org-1" });
const alert = {
  id: "alert-1",
  projectId: "p1",
  kind: "compliance_regression" as const,
  summary: "Regressed",
  at: "2026-01-01T00:00:00.000Z",
  read: false,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("markAlertReadAction", () => {
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
    markAlertReadById.mockResolvedValue(true);
    const form = new FormData();
    form.set("alertId", "alert-1");

    const result = await markAlertReadAction(initialActionState, form);
    expect(result.message).toBe("Alert marked as read.");
    expect(markAlertReadById).toHaveBeenCalledWith(
      expect.anything(),
      "alert-1",
    );
    expect(getWorkspace).not.toHaveBeenCalled();
  });

  it("reports an unknown alert when the row is gone inside the lock", async () => {
    signIn();
    getAlertById.mockResolvedValue(alert);
    getProjectById.mockResolvedValue(project);
    listMembershipsForOrgs.mockResolvedValue([
      testMembership("member", { orgId: project.orgId, userId: "user-1" }),
    ]);
    withProjectLock.mockImplementation(async (_id, fn) => fn({}));
    markAlertReadById.mockResolvedValue(false);
    const form = new FormData();
    form.set("alertId", "alert-1");

    const result = await markAlertReadAction(initialActionState, form);
    expect(result.ok ? null : result.message).toMatch(/Unknown alert/);
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
    expect(markAlertReadById).not.toHaveBeenCalled();
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

describe("markAllAlertsReadAction", () => {
  function signIn(): void {
    actionAuthMocks.auth.mockResolvedValue({
      user: { id: "user-1", login: "alice" },
    });
  }

  function form(projectId: string): FormData {
    const data = new FormData();
    data.set("projectId", projectId);
    return data;
  }

  it("marks every unread alert and pluralizes the count", async () => {
    signIn();
    getWorkspace.mockResolvedValue(testWorkspace({ role: "member", project }));
    withProjectLock.mockImplementation(async (_id, fn) => fn({}));
    listAlertsForProject.mockResolvedValue([alert]);
    markAllProjectAlertsRead.mockResolvedValue(2);

    const result = await markAllAlertsReadAction(
      initialActionState,
      form(project.id),
    );
    expect(result.message).toBe("2 alerts marked as read.");
  });

  it("uses the singular for one alert", async () => {
    signIn();
    getWorkspace.mockResolvedValue(testWorkspace({ role: "member", project }));
    withProjectLock.mockImplementation(async (_id, fn) => fn({}));
    listAlertsForProject.mockResolvedValue([alert]);
    markAllProjectAlertsRead.mockResolvedValue(1);

    const result = await markAllAlertsReadAction(
      initialActionState,
      form(project.id),
    );
    expect(result.message).toBe("1 alert marked as read.");
  });

  it("reports no unread alerts", async () => {
    signIn();
    getWorkspace.mockResolvedValue(testWorkspace({ role: "member", project }));
    withProjectLock.mockImplementation(async (_id, fn) => fn({}));
    listAlertsForProject.mockResolvedValue([]);
    markAllProjectAlertsRead.mockResolvedValue(0);

    const result = await markAllAlertsReadAction(
      initialActionState,
      form(project.id),
    );
    expect(result.message).toBe("No unread alerts.");
  });

  it("rejects a viewer without the project permission", async () => {
    signIn();
    getWorkspace.mockResolvedValue(
      testWorkspace({ role: "viewer", project, db: { memberships: [] } }),
    );
    withProjectLock.mockImplementation(async (_id, fn) => fn({}));

    const result = await markAllAlertsReadAction(
      initialActionState,
      form(project.id),
    );
    expect(result.ok ? null : result.message).toMatch(/Not allowed/);
    expect(markAllProjectAlertsRead).not.toHaveBeenCalled();
  });
});

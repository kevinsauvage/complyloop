import "@/test-fixtures/register-action-workspace-mock";
import "@/test-fixtures/register-repo-mock";

import { afterEach, describe, expect, it, vi } from "vitest";

import { maxRuntimePages } from "@complyloop/analysis-core/contract/assessment-limits";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";

import { initialActionState } from "@/core/actions/action-state";
import {
  actionWorkspaceMocks,
  clearRecordedWrites,
  mockProjectTx,
  recordedWrites,
} from "@/test-fixtures/action-workspace-mocks";
import { testProject } from "@/test-fixtures/project";
import { testWorkspace } from "@/test-fixtures/workspace";

import { updateRuntimeAuditAction } from "./runtime-audit";

const { withProjectTx } = actionWorkspaceMocks;
const assertSafeRuntimeUrl = vi.hoisted(() => vi.fn());
const assertRuntimeAuditRateLimit = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("../rate-limit", async () => {
  const actual =
    await vi.importActual<typeof import("../rate-limit")>("../rate-limit");
  return {
    ...actual,
    assertRuntimeAuditRateLimit: (...args: unknown[]) =>
      assertRuntimeAuditRateLimit(...args),
  };
});

vi.mock("@complyloop/analysis-core/runtime/url-safety", () => ({
  assertSafeRuntimeUrl: (...args: unknown[]) => assertSafeRuntimeUrl(...args),
}));

vi.mock("./shared", async () => {
  const actual = await vi.importActual<typeof import("./shared")>("./shared");
  return {
    ...actual,
    refresh: () => refresh(),
  };
});

const project = testProject({
  orgId: "org-1",
  runtimeBaseUrl: "https://old.example",
  runtimeRoutes: ["/old"],
});

function workspaceFor(role: "viewer" | "member" | "admin" | "owner") {
  return testWorkspace({ role, project });
}

afterEach(() => {
  clearRecordedWrites();
  vi.clearAllMocks();
});

describe("updateRuntimeAuditAction", () => {
  it("denies members who cannot connect", async () => {
    mockProjectTx(workspaceFor("member"));
    assertSafeRuntimeUrl.mockResolvedValue("https://app.example/");
    const form = new FormData();
    form.set("projectId", project.id);
    form.set("runtimeBaseUrl", "https://app.example");

    const result = await updateRuntimeAuditAction(initialActionState, form);
    expect(result.ok ? null : result.message).toMatch(/Not allowed/);
  });

  it("clears runtime settings when the base URL is empty", async () => {
    const workspace = workspaceFor("owner");
    mockProjectTx(workspace);
    const form = new FormData();
    form.set("projectId", project.id);
    form.set("runtimeBaseUrl", "  ");

    const result = await updateRuntimeAuditAction(initialActionState, form);

    expect(result.message).toMatch(/Runtime audit settings saved/);
    expect(recordedWrites()?.project?.runtimeBaseUrl).toBeUndefined();
    expect(recordedWrites()?.project?.runtimeRoutes).toBeUndefined();
    expect(assertSafeRuntimeUrl).not.toHaveBeenCalled();
    expect(assertRuntimeAuditRateLimit).toHaveBeenCalled();
  });

  it("normalizes the origin and the selected pages for owners", async () => {
    const workspace = workspaceFor("owner");
    mockProjectTx(workspace);
    assertSafeRuntimeUrl.mockResolvedValue("https://app.example/path");
    const form = new FormData();
    form.set("projectId", project.id);
    form.set("runtimeBaseUrl", "https://app.example/path");
    for (const route of ["home", "/about", "/home"]) {
      form.append("runtimeRoutes", route);
    }

    const result = await updateRuntimeAuditAction(initialActionState, form);

    expect(result.message).toMatch(/Runtime audit settings saved/);
    expect(recordedWrites()?.project?.runtimeBaseUrl).toBe(
      "https://app.example",
    );
    // One value per checked page, de-duplicated and given a leading slash.
    expect(recordedWrites()?.project?.runtimeRoutes).toEqual([
      "/home",
      "/about",
    ]);
  });

  it("accepts a single selected page posted as one value", async () => {
    const workspace = workspaceFor("owner");
    mockProjectTx(workspace);
    assertSafeRuntimeUrl.mockResolvedValue("https://app.example/");
    const form = new FormData();
    form.set("projectId", project.id);
    form.set("runtimeBaseUrl", "https://app.example");
    form.set("runtimeRoutes", "/pricing");

    await updateRuntimeAuditAction(initialActionState, form);

    expect(recordedWrites()?.project?.runtimeRoutes).toEqual(["/pricing"]);
  });

  it("refuses more pages than one assessment audits", async () => {
    assertSafeRuntimeUrl.mockResolvedValue("https://app.example/");
    const form = new FormData();
    form.set("projectId", project.id);
    form.set("runtimeBaseUrl", "https://app.example");
    for (let index = 0; index < maxRuntimePages() + 1; index += 1) {
      form.append("runtimeRoutes", `/page-${index}`);
    }

    const result = await updateRuntimeAuditAction(initialActionState, form);

    expect(result.ok ? null : result.message).toMatch(
      /at most \d+ pages to audit/,
    );
    expect(withProjectTx).not.toHaveBeenCalled();
  });

  it("refuses a page path that is too long", async () => {
    assertSafeRuntimeUrl.mockResolvedValue("https://app.example/");
    const form = new FormData();
    form.set("projectId", project.id);
    form.set("runtimeBaseUrl", "https://app.example");
    form.append("runtimeRoutes", `/${"a".repeat(2001)}`);

    const result = await updateRuntimeAuditAction(initialActionState, form);

    expect(result.ok ? null : result.message).toMatch(/too long to audit/);
    expect(withProjectTx).not.toHaveBeenCalled();
  });

  it("surfaces unsafe URL errors", async () => {
    assertSafeRuntimeUrl.mockRejectedValue(
      new PublicError("URL is not allowed for runtime audit."),
    );
    const form = new FormData();
    form.set("projectId", project.id);
    form.set("runtimeBaseUrl", "http://127.0.0.1");

    const result = await updateRuntimeAuditAction(initialActionState, form);
    expect(result.ok ? null : result.message).toMatch(
      /not allowed for runtime audit/,
    );
    expect(withProjectTx).not.toHaveBeenCalled();
  });

  it("rejects absolute http(s) routes", async () => {
    assertSafeRuntimeUrl.mockResolvedValue("https://app.example/");
    const form = new FormData();
    form.set("projectId", project.id);
    form.set("runtimeBaseUrl", "https://app.example");
    form.append("runtimeRoutes", "/ok");
    form.append("runtimeRoutes", "http://127.0.0.1/admin");

    const result = await updateRuntimeAuditAction(initialActionState, form);
    expect(result.ok ? null : result.message).toMatch(
      /must be paths under the Preview/,
    );
    expect(withProjectTx).not.toHaveBeenCalled();
  });

  it("trims and prefixes bare pages", async () => {
    const workspace = workspaceFor("owner");
    mockProjectTx(workspace);
    assertSafeRuntimeUrl.mockResolvedValue("https://app.example/");

    const form = new FormData();
    form.set("projectId", project.id);
    form.set("runtimeBaseUrl", "https://app.example");
    form.append("runtimeRoutes", "  docs  ");
    form.append("runtimeRoutes", "  ");
    await updateRuntimeAuditAction(initialActionState, form);

    expect(recordedWrites()?.project?.runtimeRoutes).toEqual(["/docs"]);
  });

  it("stores an empty routes list when no page is selected (scan defaults to /)", async () => {
    const workspace = workspaceFor("owner");
    mockProjectTx(workspace);
    assertSafeRuntimeUrl.mockResolvedValue("https://app.example/");
    const form = new FormData();
    form.set("projectId", project.id);
    form.set("runtimeBaseUrl", "https://app.example");

    const result = await updateRuntimeAuditAction(initialActionState, form);

    expect(result.message).toMatch(/Runtime audit settings saved/);
    expect(recordedWrites()?.project?.runtimeRoutes).toEqual([]);
  });
});

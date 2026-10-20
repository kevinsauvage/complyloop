import "@/test-fixtures/register-action-workspace-mock";
import "@/test-fixtures/register-repo-mock";

import { afterEach, describe, expect, it, vi } from "vitest";

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
    form.set("runtimeBaseUrl", "https://app.example");

    const result = await updateRuntimeAuditAction(initialActionState, form);
    expect(result.ok ? null : result.message).toMatch(/Not allowed/);
  });

  it("clears runtime settings when the base URL is empty", async () => {
    const workspace = workspaceFor("owner");
    mockProjectTx(workspace);
    const form = new FormData();
    form.set("runtimeBaseUrl", "  ");

    const result = await updateRuntimeAuditAction(initialActionState, form);

    expect(result.message).toMatch(/Runtime audit settings saved/);
    expect(recordedWrites()?.project?.runtimeBaseUrl).toBeUndefined();
    expect(recordedWrites()?.project?.runtimeRoutes).toBeUndefined();
    expect(assertSafeRuntimeUrl).not.toHaveBeenCalled();
    expect(assertRuntimeAuditRateLimit).toHaveBeenCalled();
  });

  it("normalizes the origin and routes for owners", async () => {
    const workspace = workspaceFor("owner");
    mockProjectTx(workspace);
    assertSafeRuntimeUrl.mockResolvedValue("https://app.example/path");
    const form = new FormData();
    form.set("runtimeBaseUrl", "https://app.example/path");
    form.set("runtimeRoutes", "home, /about\ncontact");

    const result = await updateRuntimeAuditAction(initialActionState, form);

    expect(result.message).toMatch(/Runtime audit settings saved/);
    expect(recordedWrites()?.project?.runtimeBaseUrl).toBe(
      "https://app.example",
    );
    expect(recordedWrites()?.project?.runtimeRoutes).toEqual([
      "/home",
      "/about",
      "/contact",
    ]);
  });

  it("surfaces unsafe URL errors", async () => {
    assertSafeRuntimeUrl.mockRejectedValue(
      new PublicError("URL is not allowed for runtime audit."),
    );
    const form = new FormData();
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
    form.set("runtimeBaseUrl", "https://app.example");
    form.set("runtimeRoutes", "/ok\nhttp://127.0.0.1/admin");

    const result = await updateRuntimeAuditAction(initialActionState, form);
    expect(result.ok ? null : result.message).toMatch(
      /must be paths under the Preview/,
    );
    expect(withProjectTx).not.toHaveBeenCalled();
  });

  it("splits, trims, and prefixes bare routes", async () => {
    const workspace = workspaceFor("owner");
    mockProjectTx(workspace);
    assertSafeRuntimeUrl.mockResolvedValue("https://app.example/");

    const commaForm = new FormData();
    commaForm.set("runtimeBaseUrl", "https://app.example");
    commaForm.set("runtimeRoutes", "a,b");
    await updateRuntimeAuditAction(initialActionState, commaForm);
    expect(recordedWrites()?.project?.runtimeRoutes).toEqual(["/a", "/b"]);

    const paddedForm = new FormData();
    paddedForm.set("runtimeBaseUrl", "https://app.example");
    paddedForm.set("runtimeRoutes", " /x ");
    await updateRuntimeAuditAction(initialActionState, paddedForm);
    expect(recordedWrites()?.project?.runtimeRoutes).toEqual(["/x"]);
  });

  it("stores an empty routes list when the field is blank (scan defaults to /)", async () => {
    const workspace = workspaceFor("owner");
    mockProjectTx(workspace);
    assertSafeRuntimeUrl.mockResolvedValue("https://app.example/");
    const form = new FormData();
    form.set("runtimeBaseUrl", "https://app.example");
    form.set("runtimeRoutes", "   ");

    const result = await updateRuntimeAuditAction(initialActionState, form);

    expect(result.message).toMatch(/Runtime audit settings saved/);
    expect(recordedWrites()?.project?.runtimeRoutes).toEqual([]);
  });
});

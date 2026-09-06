import "@/test-fixtures/register-action-workspace-mock";
import { afterEach, describe, expect, it, vi } from "vitest";
import { actionWorkspaceMocks, invokeProjectWriteMock } from "@/test-fixtures/action-workspace-mocks";
import { testProject } from "@/test-fixtures/project";
import { testWorkspace } from "@/test-fixtures/workspace";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { emptyActionMessageState } from "../action-state";
import { updateRuntimeAuditAction } from "./runtime-audit";

const { withProjectWrite } = actionWorkspaceMocks;
const assertSafeRuntimeUrl = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

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
  vi.clearAllMocks();
});

describe("updateRuntimeAuditAction", () => {
  it("denies members who cannot connect", async () => {
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspaceFor("member"), fn));
    assertSafeRuntimeUrl.mockResolvedValue("https://app.example/");
    const form = new FormData();
    form.set("runtimeBaseUrl", "https://app.example");

    const result = await updateRuntimeAuditAction(
      emptyActionMessageState,
      form,
    );
    expect(result.error).toMatch(/Not allowed/);
  });

  it("clears runtime settings when the base URL is empty", async () => {
    const workspace = workspaceFor("owner");
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));
    const form = new FormData();
    form.set("runtimeBaseUrl", "  ");

    const result = await updateRuntimeAuditAction(
      emptyActionMessageState,
      form,
    );

    expect(result.message).toMatch(/Runtime audit settings saved/);
    expect(workspace.project?.runtimeBaseUrl).toBeUndefined();
    expect(workspace.project?.runtimeRoutes).toBeUndefined();
    expect(assertSafeRuntimeUrl).not.toHaveBeenCalled();
  });

  it("normalizes the origin and routes for owners", async () => {
    const workspace = workspaceFor("owner");
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));
    assertSafeRuntimeUrl.mockResolvedValue("https://app.example/path");
    const form = new FormData();
    form.set("runtimeBaseUrl", "https://app.example/path");
    form.set("runtimeRoutes", "home, /about\ncontact");

    const result = await updateRuntimeAuditAction(
      emptyActionMessageState,
      form,
    );

    expect(result.message).toMatch(/Runtime audit settings saved/);
    expect(workspace.project?.runtimeBaseUrl).toBe("https://app.example");
    expect(workspace.project?.runtimeRoutes).toEqual([
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

    const result = await updateRuntimeAuditAction(
      emptyActionMessageState,
      form,
    );
    expect(result.error).toMatch(/not allowed for runtime audit/);
    expect(withProjectWrite).not.toHaveBeenCalled();
  });
});

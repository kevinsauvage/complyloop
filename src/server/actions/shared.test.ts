import { afterEach, describe, expect, it, vi } from "vitest";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";

import { testRemediation } from "@/test-fixtures/remediation";
import { testWorkspace } from "@/test-fixtures/workspace";

const getSession = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

vi.mock("@/server/auth-session", () => ({
  getSession: (...args: unknown[]) => getSession(...args),
}));

import {
  refresh,
  replaceRemediation,
  requireOnActive,
  requireSignedIn,
} from "./shared";

afterEach(() => {
  vi.clearAllMocks();
});

describe("refresh", () => {
  it("revalidates the whole app layout when given no paths", () => {
    refresh();
    expect(revalidatePath).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("revalidates only the given routes, de-duplicated", () => {
    refresh("/findings", "/dashboard", "/findings");
    expect(revalidatePath).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenCalledWith("/findings");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePath).not.toHaveBeenCalledWith("/", "layout");
  });
});

describe("requireSignedIn", () => {
  it("returns the user id and GitHub login", async () => {
    getSession.mockResolvedValue({ user: { id: "u1", login: "alice" } });
    await expect(requireSignedIn()).resolves.toEqual({
      userId: "u1",
      githubLogin: "alice",
    });
  });

  it("maps a missing login to null", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    await expect(requireSignedIn()).resolves.toEqual({
      userId: "u1",
      githubLogin: null,
    });
  });

  it("throws the default message when signed out", async () => {
    getSession.mockResolvedValue(null);
    await expect(requireSignedIn()).rejects.toThrow("Sign in to continue.");
  });

  it("throws the caller-supplied message", async () => {
    getSession.mockResolvedValue({ user: {} });
    await expect(requireSignedIn("Nope.")).rejects.toThrow("Nope.");
  });
});

describe("replaceRemediation", () => {
  it("appends to an existing remediation list", () => {
    const existing = testRemediation({ id: "r-old" });
    const updated = testRemediation({ id: "r-new" });
    const payload: ProjectWritePayload = { remediations: [existing] };
    replaceRemediation(payload, updated);
    expect(payload.remediations).toEqual([existing, updated]);
  });

  it("starts a list when none exists", () => {
    const updated = testRemediation({ id: "r-new" });
    const payload: ProjectWritePayload = {};
    replaceRemediation(payload, updated);
    expect(payload.remediations).toEqual([updated]);
  });
});

describe("requireOnActive", () => {
  it("passes when the active project grants the permission", () => {
    const workspace = testWorkspace({ role: "member" });
    expect(() => requireOnActive(workspace, "project.view")).not.toThrow();
  });

  it("throws when no project is connected", () => {
    const workspace = { ...testWorkspace(), project: null };
    expect(() => requireOnActive(workspace, "project.view")).toThrow(
      "No project connected.",
    );
  });

  it("throws a PublicError when the role lacks the permission", () => {
    const workspace = testWorkspace({ role: "viewer" });
    expect(() => requireOnActive(workspace, "project.remediate")).toThrow(
      PublicError,
    );
  });
});

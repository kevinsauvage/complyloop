import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrgMembership } from "@/core/types";
import { ConnectError } from "./connect-url";
import {
  assertConnectProjectAllowed,
  assertSafeGitRemoteUrl,
  extractGitHost,
  isBlockedGitHost,
  isHostedConnectMode,
  isLocalProjectConnectAllowed,
  userCanConnectProjects,
} from "./connect-policy";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isLocalProjectConnectAllowed", () => {
  it("defaults on outside production and off in production", () => {
    vi.stubEnv("ALLOW_LOCAL_PROJECT_CONNECT", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(isLocalProjectConnectAllowed()).toBe(true);
    expect(isHostedConnectMode()).toBe(false);

    vi.stubEnv("NODE_ENV", "production");
    expect(isLocalProjectConnectAllowed()).toBe(false);
    expect(isHostedConnectMode()).toBe(true);
  });

  it("honors explicit ALLOW_LOCAL_PROJECT_CONNECT", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_LOCAL_PROJECT_CONNECT", "true");
    expect(isLocalProjectConnectAllowed()).toBe(true);

    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_LOCAL_PROJECT_CONNECT", "false");
    expect(isLocalProjectConnectAllowed()).toBe(false);
  });
});

describe("assertSafeGitRemoteUrl", () => {
  it("allows common public git hosts", () => {
    expect(() =>
      assertSafeGitRemoteUrl("https://github.com/acme/repo"),
    ).not.toThrow();
    expect(() =>
      assertSafeGitRemoteUrl("git@github.com:acme/repo.git"),
    ).not.toThrow();
    expect(extractGitHost("git@gitlab.com:acme/repo.git")).toBe("gitlab.com");
  });

  it("rejects loopback, private, and metadata hosts", () => {
    const blocked = [
      "https://127.0.0.1/org/repo.git",
      "https://localhost/org/repo.git",
      "https://192.168.1.10/org/repo.git",
      "https://10.0.0.5/org/repo.git",
      "https://172.16.0.1/org/repo.git",
      "https://169.254.169.254/latest.git",
      "https://metadata.google.internal/repo.git",
      "git@localhost:org/repo.git",
    ];
    for (const url of blocked) {
      expect(() => assertSafeGitRemoteUrl(url), url).toThrow(ConnectError);
    }
    expect(isBlockedGitHost("127.0.0.1")).toBe(true);
    expect(isBlockedGitHost("github.com")).toBe(false);
  });
});

describe("assertConnectProjectAllowed", () => {
  const ownerMembership: OrgMembership = {
    id: "m1",
    orgId: "org-1",
    role: "owner",
    userId: "user-a",
    githubLogin: "alice",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const viewerMembership: OrgMembership = {
    id: "m2",
    orgId: "org-1",
    role: "viewer",
    userId: "user-v",
    githubLogin: "viewer",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("rejects anonymous connect in hosted mode", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_LOCAL_PROJECT_CONNECT", "");
    expect(() =>
      assertConnectProjectAllowed({
        userId: null,
        activeOrgId: null,
        memberships: [],
        target: "https://github.com/acme/repo",
      }),
    ).toThrow(/Sign in/);
  });

  it("rejects local paths when local connects are disabled", () => {
    vi.stubEnv("ALLOW_LOCAL_PROJECT_CONNECT", "false");
    expect(() =>
      assertConnectProjectAllowed({
        userId: "user-a",
        activeOrgId: "org-1",
        memberships: [ownerMembership],
        target: "/tmp/my-app",
      }),
    ).toThrow(/Local path connects are disabled/);
  });

  it("requires project.connect on the active org for signed-in users", () => {
    vi.stubEnv("ALLOW_LOCAL_PROJECT_CONNECT", "true");
    expect(
      userCanConnectProjects([viewerMembership], "user-v", "org-1"),
    ).toBe(false);
    expect(() =>
      assertConnectProjectAllowed({
        userId: "user-v",
        activeOrgId: "org-1",
        memberships: [viewerMembership],
        target: "https://github.com/acme/repo",
      }),
    ).toThrow(/admin or owner/);

    expect(() =>
      assertConnectProjectAllowed({
        userId: "user-a",
        activeOrgId: "org-1",
        memberships: [ownerMembership],
        target: "https://github.com/acme/repo",
      }),
    ).not.toThrow();
  });

  it("allows unsigned local connect only in laptop demo mode", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_LOCAL_PROJECT_CONNECT", "");
    expect(() =>
      assertConnectProjectAllowed({
        userId: null,
        activeOrgId: null,
        memberships: [],
        target: "/tmp/my-app",
      }),
    ).not.toThrow();
  });

  it("still blocks private git hosts for allowed users", () => {
    vi.stubEnv("ALLOW_LOCAL_PROJECT_CONNECT", "true");
    expect(() =>
      assertConnectProjectAllowed({
        userId: "user-a",
        activeOrgId: "org-1",
        memberships: [ownerMembership],
        target: "https://127.0.0.1/org/repo.git",
      }),
    ).toThrow(/not allowed/);
  });
});

import { describe, expect, it } from "vitest";

import type { OrgMembership } from "@complyloop/analysis-core/contract/project-types";

import { testProject } from "@/test-fixtures/project";

import { projectCapabilities } from "./project-capabilities";
import type { AccessContext } from "./project-visibility";

const project = testProject({ orgId: "org-1" });

function access(role: OrgMembership["role"], userId = "user-1"): AccessContext {
  const membership: OrgMembership = {
    id: "m1",
    orgId: "org-1",
    userId,
    role,
    githubLogin: "alice",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  return {
    userId,
    githubLogin: "alice",
    organizations: [],
    memberships: [membership],
  };
}

describe("projectCapabilities", () => {
  it("gives viewers read-only access", () => {
    expect(projectCapabilities(project, access("viewer"))).toEqual({
      canView: true,
      canAssess: false,
      canRemediate: false,
      canConnect: false,
    });
  });

  it("lets members assess and remediate but not connect", () => {
    expect(projectCapabilities(project, access("member"))).toEqual({
      canView: true,
      canAssess: true,
      canRemediate: true,
      canConnect: false,
    });
  });

  it("lets owners connect on a project", () => {
    expect(projectCapabilities(project, access("owner"))).toEqual({
      canView: true,
      canAssess: true,
      canRemediate: true,
      canConnect: true,
    });
  });

  it("allows unsigned users to see the connect panel when no project is active", () => {
    expect(
      projectCapabilities(null, {
        userId: null,
        githubLogin: null,
        organizations: [],
        memberships: [],
      }),
    ).toEqual({
      canView: false,
      canAssess: false,
      canRemediate: false,
      canConnect: true,
    });
  });

  it("lets signed-in owners connect when no project is active", () => {
    expect(projectCapabilities(null, access("owner"), "org-1")).toEqual({
      canView: false,
      canAssess: false,
      canRemediate: false,
      canConnect: true,
    });
  });

  it("denies signed-in viewers from connecting with no project", () => {
    expect(projectCapabilities(null, access("viewer"), "org-1")).toEqual({
      canView: false,
      canAssess: false,
      canRemediate: false,
      canConnect: false,
    });
  });
});

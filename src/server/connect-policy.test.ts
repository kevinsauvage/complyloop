import { describe, expect, it } from "vitest";
import { userCanConnectProjects } from "./connect-policy";
import type { OrgMembership } from "@complyloop/domain/project-types";

describe("userCanConnectProjects", () => {
  const membership: OrgMembership = {
    id: "m1",
    orgId: "org-1",
    role: "admin",
    userId: "user-1",
    githubLogin: "alice",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("requires an org id", () => {
    expect(userCanConnectProjects([membership], "user-1", null)).toBe(false);
  });

  it("requires membership with project.connect", () => {
    expect(userCanConnectProjects([membership], "user-1", "org-1")).toBe(true);
    expect(
      userCanConnectProjects(
        [{ ...membership, role: "member" }],
        "user-1",
        "org-1",
      ),
    ).toBe(false);
    expect(userCanConnectProjects([membership], "user-2", "org-1")).toBe(false);
  });
});

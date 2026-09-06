import { describe, expect, it } from "vitest";
import type { OrgMembership, Organization, Project, Requirement } from "@complyloop/analysis-core/contract/project-types";
import type { EvidenceRecord, Finding } from "@complyloop/analysis-core/contract/finding-types";
import { testProject } from "@/test-fixtures/project";
import {
  type AccessContext,
  accessFromStore,
  evidenceForProject,
  findingsForProject,
  isProjectVisible,
  requirementsForProject,
  resolveActiveProject,
  resolveVisibleFinding,
  visibleProjectIds,
  visibleProjects,
} from "./project-visibility";

function project(
  partial: Pick<Project, "id" | "source" | "orgId"> &
    Partial<Pick<Project, "ownerUserId" | "name">>,
): Project {
  return testProject({
    name: partial.name ?? partial.id,
    ...partial,
  });
}

function ctx(
  userId: string | null | undefined,
  memberships: OrgMembership[] = [],
  organizations: Organization[] = [],
): AccessContext {
  return { userId, memberships, organizations };
}

describe("accessFromStore", () => {
  it("builds AccessContext from store collections", () => {
    const organizations: Organization[] = [
      { id: "o1", name: "Acme", slug: "acme", createdAt: "2026-01-01T00:00:00.000Z" },
    ];
    const memberships: OrgMembership[] = [
      {
        id: "m1",
        orgId: "o1",
        role: "member",
        userId: "u1",
        githubLogin: "u1",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    expect(
      accessFromStore({ organizations, memberships }, "u1", "login"),
    ).toEqual({
      userId: "u1",
      githubLogin: "login",
      organizations,
      memberships,
    });
  });
});

function finding(partial: Pick<Finding, "id" | "projectId">): Finding {
  return {
    controlId: "ctrl-1",
    assessmentId: "assess-1",
    checkId: "img-alt",
    kind: "violation",
    status: "open",
    severity: "serious",
    confidence: "high",
    reason: "missing alt",
    location: {
      kind: "source",
      filePath: "src/Card.tsx",
      line: 1,
      column: 1,
      snippet: "<img />",
      span: { start: 0, end: 10 },
    },
    explanations: [],
    fix: null,
    detectedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function evidence(
  partial: Pick<EvidenceRecord, "id" | "projectId">,
): EvidenceRecord {
  return {
    at: "2026-01-01T00:00:00.000Z",
    kind: "assessment_completed",
    summary: "done",
    ...partial,
  };
}

function requirement(
  partial: Pick<Requirement, "id" | "projectId">,
): Requirement {
  return {
    controlId: "ctrl-1",
    status: "failed",
    determination: "automated",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("project visibility", () => {
  const orgProject = project({
    id: "org-repo",
    source: "github",
    orgId: "org-1",
    ownerUserId: "user-a",
  });
  const membership: OrgMembership = {
    id: "m1",
    orgId: "org-1",
    role: "member",
    userId: "user-b",
    githubLogin: "bob",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const ownerMembership: OrgMembership = {
    id: "m-owner",
    orgId: "org-1",
    role: "owner",
    userId: "user-a",
    githubLogin: "alice",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("requires org membership for org-scoped projects", () => {
    expect(isProjectVisible(orgProject, ctx(null))).toBe(false);
    expect(isProjectVisible(orgProject, ctx("user-b"))).toBe(false);
    expect(
      isProjectVisible(orgProject, ctx("user-b", [membership])),
    ).toBe(true);
    expect(
      isProjectVisible(orgProject, ctx("user-a", [ownerMembership])),
    ).toBe(true);
  });

  it("filters the switcher list for the signed-in user", () => {
    const otherOrgProject = project({
      id: "other-repo",
      source: "github",
      orgId: "org-2",
      ownerUserId: "user-c",
    });
    expect(
      visibleProjects(
        [orgProject, otherOrgProject],
        ctx("user-a", [ownerMembership]),
      ).map((p) => p.id),
    ).toEqual(["org-repo"]);
  });

  it("falls back to the first visible project when the active one is not", () => {
    const otherOrgProject = project({
      id: "other-repo",
      source: "github",
      orgId: "org-2",
    });
    const resolved = resolveActiveProject(
      [orgProject, otherOrgProject],
      otherOrgProject.id,
      ctx("user-a", [ownerMembership]),
    );
    expect(resolved?.id).toBe("org-repo");
  });
});

describe("tenant-scoped read helpers", () => {
  const aliceProject = project({
    id: "proj-a",
    source: "github",
    orgId: "org-a",
    ownerUserId: "user-a",
  });
  const bobProject = project({
    id: "proj-b",
    source: "github",
    orgId: "org-b",
    ownerUserId: "user-b",
  });
  const aliceMembership: OrgMembership = {
    id: "m-a",
    orgId: "org-a",
    role: "owner",
    userId: "user-a",
    githubLogin: "alice",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const bobMembership: OrgMembership = {
    id: "m-b",
    orgId: "org-b",
    role: "owner",
    userId: "user-b",
    githubLogin: "bob",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  const aliceFinding = finding({ id: "f-a", projectId: "proj-a" });
  const bobFinding = finding({ id: "f-b", projectId: "proj-b" });
  const aliceEvidence = evidence({ id: "e-a", projectId: "proj-a" });
  const bobEvidence = evidence({ id: "e-b", projectId: "proj-b" });
  const unscopedEvidence = evidence({ id: "e-x", projectId: undefined });
  const aliceRequirement = requirement({ id: "r-a", projectId: "proj-a" });
  const bobRequirement = requirement({ id: "r-b", projectId: "proj-b" });

  it("scopes evidence and requirements to the active project only", () => {
    expect(
      evidenceForProject(
        [aliceEvidence, bobEvidence, unscopedEvidence],
        "proj-a",
      ).map((record) => record.id),
    ).toEqual(["e-a"]);
    expect(
      requirementsForProject(
        [aliceRequirement, bobRequirement],
        "proj-a",
      ).map((requirement) => requirement.id),
    ).toEqual(["r-a"]);
    expect(
      findingsForProject([aliceFinding, bobFinding], "proj-a").map(
        (finding) => finding.id,
      ),
    ).toEqual(["f-a"]);
  });

  it("does not resolve another tenant's finding by id", () => {
    const aliceCtx = ctx("user-a", [aliceMembership]);
    expect(
      resolveVisibleFinding(
        "f-b",
        [aliceFinding, bobFinding],
        [aliceProject, bobProject],
        aliceCtx,
      ),
    ).toBeNull();
    expect(
      resolveVisibleFinding(
        "f-a",
        [aliceFinding, bobFinding],
        [aliceProject, bobProject],
        aliceCtx,
      )?.finding.id,
    ).toBe("f-a");
  });

  it("does not resolve a finding when the project is missing", () => {
    expect(
      resolveVisibleFinding(
        "f-a",
        [aliceFinding],
        [],
        ctx("user-a", [aliceMembership]),
      ),
    ).toBeNull();
  });

  it("lists only visible project ids for export scoping", () => {
    const ids = visibleProjectIds(
      [aliceProject, bobProject],
      ctx("user-a", [aliceMembership]),
    );
    expect([...ids]).toEqual(["proj-a"]);
    expect(ids.has("proj-b")).toBe(false);
  });

  it("keeps bob from reading alice evidence via project filter", () => {
    const bobVisible = visibleProjectIds(
      [aliceProject, bobProject],
      ctx("user-b", [bobMembership]),
    );
    const leaked = evidenceForProject(
      [aliceEvidence, bobEvidence],
      "proj-a",
    ).filter((record) => bobVisible.has(record.projectId ?? ""));
    expect(leaked).toEqual([]);
    expect(
      evidenceForProject([aliceEvidence, bobEvidence], "proj-b").map(
        (record) => record.id,
      ),
    ).toEqual(["e-b"]);
  });

  it("resolves independent preferred projects without a shared store field", () => {
    const aliceCtx = ctx("user-a", [aliceMembership]);
    const bobCtx = ctx("user-b", [bobMembership]);
    const aliceActive = resolveActiveProject(
      [aliceProject],
      "proj-a",
      aliceCtx,
    );
    const bobActive = resolveActiveProject([bobProject], "proj-b", bobCtx);
    expect(aliceActive?.id).toBe("proj-a");
    expect(bobActive?.id).toBe("proj-b");
    expect(
      resolveActiveProject([aliceProject], "proj-b", aliceCtx)?.id,
    ).toBe("proj-a");
  });
});

import { describe, expect, it } from "vitest";

import type {
  EvidenceRecord,
  Finding,
  Requirement,
} from "@complyloop/analysis-core/contract/entities";
import type {
  Organization,
  OrgMembership,
  Project,
} from "@complyloop/analysis-core/contract/project-types";

import { testProject } from "@/test-fixtures/project";

import { findingsInScope, requirementsInScope } from "./project-scope";
import {
  type AccessContext,
  accessFromStore,
  isProjectVisible,
  resolveActiveProject,
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
      {
        id: "o1",
        name: "Acme",
        slug: "acme",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
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
    expect(isProjectVisible(orgProject, ctx("user-b", [membership]))).toBe(
      true,
    );
    expect(isProjectVisible(orgProject, ctx("user-a", [ownerMembership]))).toBe(
      true,
    );
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

  it("scopes findings and requirements to the active project only", () => {
    expect(
      requirementsInScope([aliceRequirement, bobRequirement], aliceProject).map(
        (requirement) => requirement.id,
      ),
    ).toEqual(["r-a"]);
    expect(
      findingsInScope([aliceFinding, bobFinding], aliceProject).map(
        (finding) => finding.id,
      ),
    ).toEqual(["f-a"]);
  });

  it("keeps bob from reading alice evidence via project filter", () => {
    const bobVisible = new Set(
      visibleProjects(
        [aliceProject, bobProject],
        ctx("user-b", [bobMembership]),
      ).map((project) => project.id),
    );
    expect(bobVisible.has("proj-a")).toBe(false);
    // Export/report narrow rows to the resolved project id (see report.ts).
    const rows = [aliceEvidence, bobEvidence].filter(
      (record) => record.projectId === "proj-b",
    );
    expect(rows.map((record) => record.id)).toEqual(["e-b"]);
    expect(
      [aliceEvidence, bobEvidence, unscopedEvidence]
        .filter((record) => record.projectId === "proj-a")
        .map((record) => record.id),
    ).toEqual(["e-a"]);
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
    expect(resolveActiveProject([aliceProject], "proj-b", aliceCtx)?.id).toBe(
      "proj-a",
    );
  });
});

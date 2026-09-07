import { describe, expect, it } from "vitest";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import {
  connectedGitHubProjectsByFullName,
  disconnectGitHubRepo,
  findConnectedGitHubProject,
  deriveProjectName,
  githubCloneUrl,
  uniqueProjectName,
} from "./connect-github";
import { setActiveProject } from "./project-visibility";
import { emptyDb, type Db } from "./db";

function githubProject(
  partial: Pick<Project, "id" | "name" | "orgId"> &
    Partial<Omit<Project, "id" | "name" | "source" | "orgId">>,
): Project {
  return {
    source: "github",
    createdAt: "2026-01-01T00:00:00.000Z",
    github: {
      fullName: `${partial.name}/repo`,
      defaultBranch: "main",
      private: false,
    },
    ...partial,
  };
}

function seededDb(): Db {
  return emptyDb();
}

describe("deriveProjectName", () => {
  it("uses the repo segment of a GitHub full name", () => {
    expect(deriveProjectName("acme/my-shop")).toBe("my-shop");
    expect(deriveProjectName("acme/my shop")).toBe("my-shop");
  });

  it("falls back to project when the name would be empty", () => {
    expect(deriveProjectName("///")).toBe("project");
  });
});

describe("uniqueProjectName", () => {
  it("allocates a free project name", () => {
    const db = seededDb();
    db.projects.push(githubProject({ id: "p1", name: "shop", orgId: "org-1" }));
    expect(uniqueProjectName(db, "shop")).toBe("shop-2");
    expect(uniqueProjectName(db, "fresh")).toBe("fresh");
  });
});

describe("githubCloneUrl", () => {
  it("embeds the token in an HTTPS clone URL", () => {
    expect(githubCloneUrl("acme/shop", "tok en")).toBe(
      "https://x-access-token:tok%20en@github.com/acme/shop.git",
    );
  });

  it("URL-encodes special characters in the token", () => {
    expect(githubCloneUrl("acme/shop", "a/b")).toContain(
      "x-access-token:a%2Fb@",
    );
  });
});

describe("findConnectedGitHubProject", () => {
  const base = {
    id: "gh-1",
    name: "shop",
    source: "github" as const,
    orgId: "org-team",
    createdAt: "2026-01-01T00:00:00.000Z",
    github: {
      fullName: "Acme/Shop",
      defaultBranch: "main",
      private: false,
    },
  };

  it("matches by active org", () => {
    const project = { ...base, ownerUserId: "user-b" };
    expect(
      findConnectedGitHubProject([project], "ACME/SHOP", "org-team"),
    ).toBe(project);
  });

  it("does not match a different org", () => {
    const project = { ...base, ownerUserId: "user-a", orgId: "org-other" };
    expect(
      findConnectedGitHubProject([project], "acme/shop", "org-active"),
    ).toBeUndefined();
  });

  it("returns undefined when no active org is selected", () => {
    const project = { ...base, ownerUserId: "user-b" };
    expect(
      findConnectedGitHubProject([project], "acme/shop", null),
    ).toBeUndefined();
  });

  it("builds a lowercase fullName map for the picker", () => {
    const project = { ...base, ownerUserId: "user-a", orgId: "org-1" };
    expect(
      connectedGitHubProjectsByFullName([project], "org-1"),
    ).toEqual({ "acme/shop": "gh-1" });
  });
});

describe("setActiveProject", () => {
  it("returns an accessible project", () => {
    const db = seededDb();
    const projectA = githubProject({
      id: "a",
      name: "a",
      orgId: "org-1",
      ownerUserId: "user-a",
    });
    const projectB = githubProject({
      id: "b",
      name: "b",
      orgId: "org-1",
      ownerUserId: "user-a",
    });
    db.projects.push(projectA, projectB);
    db.memberships.push({
      id: "m1",
      orgId: "org-1",
      role: "owner",
      userId: "user-a",
      githubLogin: "user-a",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    expect(setActiveProject(db, projectA.id, "user-a")).toBe(projectA);
  });

  it("rejects unknown and inaccessible projects", () => {
    const db = seededDb();
    const connected = githubProject({
      id: "gh-1",
      name: "shop",
      orgId: "org-secret",
      ownerUserId: "owner-a",
    });
    db.projects.push(connected);

    expect(() => setActiveProject(db, "missing")).toThrow(/Unknown project/);
    expect(() => setActiveProject(db, connected.id, "other-user")).toThrow(
      /do not have access/,
    );
  });
});

describe("disconnectGitHubRepo", () => {
  it("returns delete/evidence/next ids without mutating the loaded Db", () => {
    const db = seededDb();
    db.memberships.push({
      id: "m1",
      orgId: "org-1",
      role: "owner",
      userId: "user-a",
      githubLogin: "user-a",
      createdAt: new Date().toISOString(),
    });
    db.projects.push({
      id: "gh-1",
      name: "shop",
      source: "github",
      sourceRef: "https://github.com/acme/shop",
      orgId: "org-1",
      ownerUserId: "user-a",
      github: {
        fullName: "acme/shop",
        defaultBranch: "main",
        private: false,
      },
      createdAt: new Date().toISOString(),
    });
    db.findings.push({
      id: "f1",
      projectId: "gh-1",
      controlId: "ctl-img-alt",
      assessmentId: "a1",
      checkId: "img-alt",
      status: "open",
      kind: "violation",
      severity: "serious",
      confidence: "high",
      reason: "fail",
      location: {
        kind: "source",
        filePath: "App.tsx",
        line: 1,
        column: 1,
        snippet: "<img />",
        span: { start: 0, end: 10 },
      },
      explanations: [],
      fix: null,
      detectedAt: new Date().toISOString(),
    });

    const { deleteProjectId, evidence, nextProjectId } = disconnectGitHubRepo(
      db,
      "gh-1",
      "user-a",
    );
    expect(deleteProjectId).toBe("gh-1");
    expect(nextProjectId).toBeNull();
    // No in-memory mutation for persistence: the loaded list stays intact
    // (SQL cascade drops scoped rows on deleteProject).
    expect(db.projects).toHaveLength(1);
    expect(db.findings).toHaveLength(1);
    expect(evidence.kind).toBe("project_disconnected");
  });
});

import { describe, expect, it } from "vitest";
import { rgaaControls, rgaaFramework } from "@/adapters/rgaa/controls";
import type { Project } from "@/core/project-types";
import {
  connectedGitHubProjectsByFullName,
  disconnectGitHubRepo,
  findConnectedGitHubProject,
} from "./connect-github";
import { setActiveProject } from "./connect-active";
import {
  deriveProjectName,
  githubCloneUrl,
  uniqueProjectName,
} from "./connect-shared";
import { emptyDb, type Db } from "./db";

function githubProject(
  partial: Pick<Project, "id" | "name"> &
    Partial<Omit<Project, "id" | "name" | "source">>,
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
  const db = emptyDb();
  db.frameworks = [rgaaFramework];
  db.controls = rgaaControls;
  return db;
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
    db.projects.push(githubProject({ id: "p1", name: "shop" }));
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
    createdAt: "2026-01-01T00:00:00.000Z",
    github: {
      fullName: "Acme/Shop",
      defaultBranch: "main",
      private: false,
    },
  };

  it("matches by owner even when active org differs", () => {
    const project = { ...base, ownerUserId: "user-a", orgId: "org-other" };
    expect(
      findConnectedGitHubProject([project], "acme/shop", "user-a", "org-active"),
    ).toBe(project);
  });

  it("matches by active org when another member connected the repo", () => {
    const project = { ...base, ownerUserId: "user-b", orgId: "org-team" };
    expect(
      findConnectedGitHubProject([project], "ACME/SHOP", "user-a", "org-team"),
    ).toBe(project);
  });

  it("does not treat undefined orgId as matching a null active org for other users", () => {
    const project = { ...base, ownerUserId: "user-b" };
    expect(
      findConnectedGitHubProject([project], "acme/shop", "user-a", null),
    ).toBeUndefined();
  });

  it("builds a lowercase fullName map for the picker", () => {
    const project = { ...base, ownerUserId: "user-a", orgId: "org-1" };
    expect(
      connectedGitHubProjectsByFullName([project], "user-a", "org-1"),
    ).toEqual({ "acme/shop": "gh-1" });
  });
});

describe("setActiveProject", () => {
  it("returns an accessible project", () => {
    const db = seededDb();
    const projectA = githubProject({
      id: "a",
      name: "a",
      ownerUserId: "user-a",
    });
    const projectB = githubProject({
      id: "b",
      name: "b",
      ownerUserId: "user-a",
    });
    db.projects.push(projectA, projectB);

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
  it("removes the project and related DB records without durable clone cleanup", () => {
    const db = seededDb();
    db.projects.push({
      id: "gh-1",
      name: "shop",
      source: "github",
      sourceRef: "https://github.com/acme/shop",
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
        snippet: "<x />",
        span: { start: 0, end: 1 },
      },
      fix: null,
      explanations: [],
      detectedAt: new Date().toISOString(),
    });
    db.alerts.push({
      id: "alert-1",
      projectId: "gh-1",
      kind: "compliance_regression",
      summary: "regressed",
      at: new Date().toISOString(),
      read: false,
    });

    expect(disconnectGitHubRepo(db, "gh-1", "user-a")).toBeNull();

    expect(db.projects).toHaveLength(0);
    expect(db.findings).toHaveLength(0);
    expect(db.alerts).toHaveLength(0);
    expect(
      db.evidence.some((record) => record.kind === "project_disconnected"),
    ).toBe(true);
  });

  it("rejects disconnecting another user's project", () => {
    const db = seededDb();
    db.projects.push({
      id: "gh-1",
      name: "shop",
      source: "github",
      ownerUserId: "user-a",
      github: {
        fullName: "acme/shop",
        defaultBranch: "main",
        private: false,
      },
      createdAt: new Date().toISOString(),
    });
    expect(() => disconnectGitHubRepo(db, "gh-1", "user-b")).toThrow(
      /permission to disconnect/,
    );
  });
});

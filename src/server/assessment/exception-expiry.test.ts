import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  EvidenceRecord,
  Requirement,
} from "@complyloop/analysis-core/contract/entities";

import { testFinding } from "@/test-fixtures/finding";
import { testProject } from "@/test-fixtures/project";

const store = vi.hoisted(() => ({
  requirements: [] as Requirement[],
  evidence: [] as EvidenceRecord[],
  openFindings: [] as ReturnType<typeof testFinding>[],
}));

vi.mock("@complyloop/db/postgres", () => ({ getDrizzle: async () => ({}) }));
vi.mock("../workspace/db", () => ({
  withProjectLock: (_id: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn({}),
}));
vi.mock("@complyloop/db/repo/projects", () => ({
  getProjectById: async (_tx: unknown, id: string) =>
    testProject({ id, orgId: "org-1" }),
}));
vi.mock("@complyloop/db/repo/requirements", () => {
  const upsert = async (_tx: unknown, rows: Requirement[]) => {
    for (const row of rows) {
      const index = store.requirements.findIndex(
        (candidate) => candidate.id === row.id,
      );
      if (index >= 0) store.requirements[index] = row;
    }
  };
  return {
    listTemporaryExceptionRequirements: async () =>
      store.requirements.filter(
        (requirement) => requirement.exception?.reason === "temporary",
      ),
    listRequirementsForProject: async (_tx: unknown, projectId: string) =>
      store.requirements.filter(
        (requirement) => requirement.projectId === projectId,
      ),
    listRequirementsForControls: async (
      _tx: unknown,
      projectId: string,
      controlIds: readonly string[],
    ) =>
      store.requirements.filter(
        (requirement) =>
          requirement.projectId === projectId &&
          controlIds.includes(requirement.controlId),
      ),
    upsertRequirements: upsert,
  };
});
vi.mock("@complyloop/db/repo/findings", () => ({
  listOpenFindingsForControls: async () => store.openFindings,
}));
vi.mock("@complyloop/db/repo/evidence", () => ({
  insertEvidenceRecords: async (_tx: unknown, records: EvidenceRecord[]) => {
    store.evidence.push(...records);
  },
}));

import { expireLapsedExceptions } from "./exception-expiry";

const NOW = new Date("2026-06-01T12:00:00.000Z");

function excepted(
  id: string,
  expiresAt: string,
  overrides: Partial<Requirement> = {},
): Requirement {
  return {
    id,
    projectId: "p1",
    controlId: "ctl-img-alt",
    status: "failed",
    determination: "human_review",
    updatedAt: "2026-05-01T00:00:00.000Z",
    exception: {
      reason: "temporary",
      note: "fix scheduled",
      at: "2026-05-01T00:00:00.000Z",
      expiresAt,
    },
    ...overrides,
  };
}

describe("expireLapsedExceptions", () => {
  beforeEach(() => {
    store.requirements = [];
    store.evidence = [];
    store.openFindings = [];
  });

  it("clears a lapsed temporary exception and re-derives the status", async () => {
    store.requirements = [
      excepted("req-1", "2026-05-31T23:59:59.999Z", {
        status: "unable_to_verify",
      }),
    ];
    store.openFindings = [
      testFinding({ projectId: "p1", controlId: "ctl-img-alt" }),
    ];

    expect(await expireLapsedExceptions(NOW)).toBe(1);

    const [requirement] = store.requirements;
    expect(requirement?.exception).toBeUndefined();
    expect(requirement?.determination).toBe("automated");
    expect(requirement?.status).toBe("failed");
    expect(store.evidence).toContainEqual(
      expect.objectContaining({
        kind: "requirement_exception_cleared",
        detail: expect.objectContaining({ expired: true }),
      }),
    );
  });

  it("leaves exceptions that have not expired yet", async () => {
    store.requirements = [excepted("req-1", "2026-06-02T00:00:00.000Z")];

    expect(await expireLapsedExceptions(NOW)).toBe(0);

    expect(store.requirements[0]?.exception).toBeDefined();
    expect(store.evidence).toEqual([]);
  });
});

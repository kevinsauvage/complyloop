import { vi } from "vitest";

import type {
  EvidenceRecord,
  Finding,
  Remediation,
  Requirement,
} from "@complyloop/analysis-core/contract/entities";
import type { Project } from "@complyloop/analysis-core/contract/project-types";

import {
  actionWorkspaceMocks,
  mockStore,
  recordedWrites,
} from "./action-workspace-mocks";

/**
 * In-memory repo layer for the targeted write model: reads resolve against the
 * fixture workspace ({@link mockStore}) and writes land there too, so a
 * requirement-status refresh re-reads exactly what the action just wrote —
 * the derivation keeps its real behaviour in tests.
 */
vi.mock("@complyloop/db/repo/findings", async () => {
  const actual = await vi.importActual<
    typeof import("@complyloop/db/repo/findings")
  >("@complyloop/db/repo/findings");
  return {
    ...actual,
    getFindingById: async (_tx: unknown, findingId: string) =>
      mockStore()?.db.findings.find((row) => row.id === findingId),
    listOpenFindingsForControls: async (
      _tx: unknown,
      projectId: string,
      controlIds: readonly string[],
    ) =>
      (mockStore()?.db.findings ?? []).filter(
        (row) =>
          row.projectId === projectId &&
          row.status === "open" &&
          controlIds.includes(row.controlId),
      ),
    upsertFindings: async (_tx: unknown, items: Finding[]) => {
      const store = mockStore();
      for (const item of items) {
        actionWorkspaceMocks.replaceById(recordedWrites().findings, item);
        if (store) actionWorkspaceMocks.replaceById(store.db.findings, item);
      }
    },
  };
});

vi.mock("@complyloop/db/repo/remediations", async () => {
  const actual = await vi.importActual<
    typeof import("@complyloop/db/repo/remediations")
  >("@complyloop/db/repo/remediations");
  return {
    ...actual,
    getRemediationByFindingId: async (_tx: unknown, findingId: string) =>
      mockStore()?.db.remediations.find((row) => row.findingId === findingId),
    upsertRemediations: async (_tx: unknown, items: Remediation[]) => {
      const store = mockStore();
      for (const item of items) {
        actionWorkspaceMocks.replaceById(recordedWrites().remediations, item);
        if (store)
          actionWorkspaceMocks.replaceById(store.db.remediations, item);
      }
    },
  };
});

vi.mock("@complyloop/db/repo/requirements", async () => {
  const actual = await vi.importActual<
    typeof import("@complyloop/db/repo/requirements")
  >("@complyloop/db/repo/requirements");
  return {
    ...actual,
    getRequirementById: async (_tx: unknown, requirementId: string) =>
      mockStore()?.db.requirements.find((row) => row.id === requirementId),
    listRequirementsForControls: async (
      _tx: unknown,
      projectId: string,
      controlIds: readonly string[],
    ) =>
      (mockStore()?.db.requirements ?? []).filter(
        (row) =>
          row.projectId === projectId && controlIds.includes(row.controlId),
      ),
    upsertRequirements: async (_tx: unknown, items: Requirement[]) => {
      const store = mockStore();
      for (const item of items) {
        actionWorkspaceMocks.replaceById(recordedWrites().requirements, item);
        if (store)
          actionWorkspaceMocks.replaceById(store.db.requirements, item);
      }
    },
  };
});

vi.mock("@complyloop/db/repo/evidence", async () => {
  const actual = await vi.importActual<
    typeof import("@complyloop/db/repo/evidence")
  >("@complyloop/db/repo/evidence");
  const toRecord = (
    entry: Omit<EvidenceRecord, "id" | "at">,
  ): EvidenceRecord => ({
    ...entry,
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
  });
  return {
    ...actual,
    insertEvidence: async (
      _tx: unknown,
      entry: Omit<EvidenceRecord, "id" | "at">,
    ) => {
      const record = toRecord(entry);
      recordedWrites().evidence.push(record);
      return record;
    },
    insertEvidenceRecords: async (
      _tx: unknown,
      records: ReadonlyArray<EvidenceRecord>,
    ) => {
      recordedWrites().evidence.push(...records);
    },
  };
});

vi.mock("@complyloop/db/repo/projects", async () => {
  const actual = await vi.importActual<
    typeof import("@complyloop/db/repo/projects")
  >("@complyloop/db/repo/projects");
  return {
    ...actual,
    updateProject: async (_tx: unknown, project: Project) => {
      const store = mockStore();
      actionWorkspaceMocks.writes.project = project;
      if (store) actionWorkspaceMocks.replaceById(store.db.projects, project);
    },
  };
});

import { describe, expect, it, vi } from "vitest";

const listEvidencePageForProject = vi.hoisted(() => vi.fn());
const loadProjectRuntime = vi.hoisted(() => vi.fn());

vi.mock("@complyloop/db/client", () => ({
  getDrizzle: async () => ({}),
}));

vi.mock("@complyloop/db/workspace-load", () => ({
  loadProjectRuntime: (...args: unknown[]) => loadProjectRuntime(...args),
}));

vi.mock("@complyloop/db/repo/evidence", () => ({
  WORKSPACE_EVIDENCE_LIMIT: 100,
  listEvidencePageForProject: (...args: unknown[]) =>
    listEvidencePageForProject(...args),
}));

import { getProjectRuntime } from "./project-runtime";

const runtimeRows = {
  requirements: [],
  assessments: [],
  findings: [],
  remediations: [],
  alerts: [],
};

describe("getProjectRuntime", () => {
  it("returns the evidence window oldest-first by default", async () => {
    loadProjectRuntime.mockResolvedValue({ ...runtimeRows });
    listEvidencePageForProject.mockResolvedValue([
      { id: "new" },
      { id: "old" },
    ]);
    const runtime = await getProjectRuntime("p1", { includeEvidence: true });
    expect(listEvidencePageForProject).toHaveBeenCalledOnce();
    expect(runtime.evidence).toEqual([{ id: "old" }, { id: "new" }]);
  });

  it("skips the evidence read when the caller loads evidence separately", async () => {
    loadProjectRuntime.mockResolvedValue({ ...runtimeRows });
    listEvidencePageForProject.mockClear();
    const runtime = await getProjectRuntime("p1", { includeEvidence: false });
    expect(listEvidencePageForProject).not.toHaveBeenCalled();
    expect(runtime.evidence).toEqual([]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import { SITE_VERIFY_TIMEOUT_MS } from "@complyloop/analysis-core/contract/assessment-limits";
import type {
  EvidenceRecord,
  Finding,
  Remediation,
  Requirement,
} from "@complyloop/analysis-core/contract/entities";

import { testFinding } from "@/test-fixtures/finding";
import { testProject } from "@/test-fixtures/project";
import { testRemediation } from "@/test-fixtures/remediation";

const getDrizzle = vi.hoisted(() => vi.fn());
const getFindingById = vi.hoisted(() => vi.fn());
const getProjectById = vi.hoisted(() => vi.fn());
const getRemediationByFindingId = vi.hoisted(() => vi.fn());
const upsertFindings = vi.hoisted(() => vi.fn());
const upsertRemediations = vi.hoisted(() => vi.fn());
const upsertRequirements = vi.hoisted(() => vi.fn());
const insertEvidence = vi.hoisted(() => vi.fn());
const insertEvidenceRecords = vi.hoisted(() => vi.fn());
const refreshRequirementsForControls = vi.hoisted(() =>
  vi.fn(async (...args: unknown[]) => {
    void args;
    return { requirements: [], evidence: [] };
  }),
);
const withProjectLock = vi.hoisted(() => vi.fn());
const runtimeViolationVerification = vi.hoisted(() => vi.fn());
const scanRuntime = vi.hoisted(() => vi.fn());

vi.mock("@complyloop/db/postgres", () => ({
  getDrizzle: (...args: unknown[]) => getDrizzle(...args),
}));

vi.mock("@complyloop/db/repo/findings", () => ({
  getFindingById: (...args: unknown[]) => getFindingById(...args),
  upsertFindings: (...args: unknown[]) => upsertFindings(...args),
}));

vi.mock("@complyloop/db/repo/projects", () => ({
  getProjectById: (...args: unknown[]) => getProjectById(...args),
}));

vi.mock("@complyloop/db/repo/remediations", () => ({
  getRemediationByFindingId: (...args: unknown[]) =>
    getRemediationByFindingId(...args),
  upsertRemediations: (...args: unknown[]) => upsertRemediations(...args),
}));

vi.mock("@complyloop/db/repo/requirements", () => ({
  upsertRequirements: (...args: unknown[]) => upsertRequirements(...args),
}));

vi.mock("@complyloop/db/repo/evidence", () => ({
  insertEvidence: (...args: unknown[]) => insertEvidence(...args),
  insertEvidenceRecords: (...args: unknown[]) => insertEvidenceRecords(...args),
}));

vi.mock("./assessment-status", () => ({
  refreshRequirementsForControls: (...args: unknown[]) =>
    refreshRequirementsForControls(...args),
}));

vi.mock("@complyloop/analysis-core/runtime/scan", () => ({
  runtimeViolationVerification: (...args: unknown[]) =>
    runtimeViolationVerification(...args),
  scanRuntime: (...args: unknown[]) => scanRuntime(...args),
}));

vi.mock("../workspace/db", () => ({
  withProjectLock: (projectId: string, fn: (tx: unknown) => unknown) =>
    withProjectLock(projectId, fn),
}));

vi.mock("../observability", () => ({
  reportWarning: vi.fn(),
  reportError: vi.fn(),
  reportEvent: vi.fn(),
}));

import { runRemediationVerifyJob } from "./remediation-verify-worker";

const project = testProject({ id: "p1", orgId: "org-1" });
const domFinding = (partial = {}) =>
  testFinding({
    location: {
      kind: "dom",
      url: "https://preview.test/",
      selector: "img",
      snippet: "<img>",
    },
    ...partial,
  });

const siteFinding = (partial = {}) =>
  testFinding({
    location: {
      kind: "site",
      detail: "missing lang",
      pages: ["https://preview.test/"],
    },
    ...partial,
  });

const implementedRemediation = () =>
  testRemediation({ status: "implemented", suggestion: null, history: [] });

/** Second argument of every call (repo functions take `tx` first). */
function argsOf<T>(mock: { mock: { calls: unknown[][] } }): T[] {
  return mock.mock.calls.flatMap((call) => (call[1] as T[] | undefined) ?? []);
}

/** Rows the worker wrote through the repo functions. */
function written() {
  return {
    findings: argsOf<Finding>(upsertFindings),
    remediations: argsOf<Remediation>(upsertRemediations),
    requirements: argsOf<Requirement>(upsertRequirements),
    evidence: [
      ...insertEvidence.mock.calls.map((call) => call[1] as EvidenceRecord),
      ...argsOf<EvidenceRecord>(insertEvidenceRecords),
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getDrizzle.mockResolvedValue({});
  // The lock helper runs its callback with an opaque tx handle.
  withProjectLock.mockImplementation(
    async (_projectId: string, fn: (tx: unknown) => unknown) => fn({}),
  );
  getProjectById.mockResolvedValue(project);
  refreshRequirementsForControls.mockResolvedValue({
    requirements: [],
    evidence: [],
  });
});

describe("runRemediationVerifyJob", () => {
  it("verifies a dom finding when the re-audit is clean", async () => {
    getFindingById.mockResolvedValue(domFinding());
    getRemediationByFindingId.mockResolvedValue(implementedRemediation());
    runtimeViolationVerification.mockResolvedValue({
      present: false,
      conclusive: true,
    });

    await runRemediationVerifyJob("f1");

    expect(written().remediations[0]?.status).toBe("verified");
    expect(written().findings[0]?.status).toBe("resolved");
    expect(
      written().evidence.some((row) => row.kind === "remediation_verified"),
    ).toBe(true);
  });

  it("re-audits a dom finding under the assessment's theme conditions", async () => {
    getFindingById.mockResolvedValue(domFinding());
    getRemediationByFindingId.mockResolvedValue(implementedRemediation());
    runtimeViolationVerification.mockResolvedValue({
      present: false,
      conclusive: true,
    });

    await runRemediationVerifyJob("f1");

    // A default-theme-only re-check would verify a dark-mode-only defect.
    expect(runtimeViolationVerification).toHaveBeenCalledWith(
      expect.objectContaining({ checkId: expect.any(String) }),
      undefined,
      { browserConditions: ["dark", "light"] },
    );
  });

  it("re-derives the control's requirement from its real rows", async () => {
    getFindingById.mockResolvedValue(domFinding());
    getRemediationByFindingId.mockResolvedValue(implementedRemediation());
    runtimeViolationVerification.mockResolvedValue({
      present: false,
      conclusive: true,
    });

    await runRemediationVerifyJob("f1");

    expect(refreshRequirementsForControls).toHaveBeenCalledWith(
      expect.anything(),
      project,
      [expect.any(String)],
      expect.objectContaining({ runtimeRan: true }),
    );
  });

  it("records still-failing (and re-opens a resolved finding) when detected", async () => {
    getFindingById.mockResolvedValue(domFinding({ status: "resolved" }));
    getRemediationByFindingId.mockResolvedValue(implementedRemediation());
    runtimeViolationVerification.mockResolvedValue({
      present: true,
      conclusive: true,
    });

    await runRemediationVerifyJob("f1");

    // Not advanced to verified.
    expect(written().remediations).toHaveLength(0);
    expect(written().findings[0]?.status).toBe("open");
    expect(
      written().evidence.some(
        (row) => row.kind === "remediation_verification_failed",
      ),
    ).toBe(true);
  });

  it("records an inconclusive re-audit without re-opening or re-deriving", async () => {
    getFindingById.mockResolvedValue(domFinding({ status: "resolved" }));
    getRemediationByFindingId.mockResolvedValue(implementedRemediation());
    runtimeViolationVerification.mockResolvedValue({
      present: true,
      conclusive: false,
    });

    await runRemediationVerifyJob("f1");

    // A preview outage is not a proven regression: no status may move.
    expect(upsertFindings).not.toHaveBeenCalled();
    expect(refreshRequirementsForControls).not.toHaveBeenCalled();
    expect(upsertRemediations).not.toHaveBeenCalled();
    expect(
      written().evidence.some(
        (row) => row.kind === "remediation_verification_failed",
      ),
    ).toBe(true);
  });

  it("does nothing when the remediation is no longer implemented", async () => {
    getFindingById.mockResolvedValue(domFinding());
    getRemediationByFindingId.mockResolvedValue(
      testRemediation({ status: "verified", suggestion: null, history: [] }),
    );
    runtimeViolationVerification.mockResolvedValue({
      present: false,
      conclusive: true,
    });

    await runRemediationVerifyJob("f1");

    expect(upsertFindings).not.toHaveBeenCalled();
    expect(upsertRemediations).not.toHaveBeenCalled();
    expect(insertEvidence).not.toHaveBeenCalled();
  });

  it("rejects a source finding (defence in depth)", async () => {
    getFindingById.mockResolvedValue(testFinding());
    getRemediationByFindingId.mockResolvedValue(implementedRemediation());

    await expect(runRemediationVerifyJob("f1")).rejects.toThrow(
      /draft pull request/i,
    );
    expect(upsertFindings).not.toHaveBeenCalled();
  });

  it("throws when the finding is unknown", async () => {
    getFindingById.mockResolvedValue(undefined);
    await expect(runRemediationVerifyJob("missing")).rejects.toThrow(
      /unknown finding/i,
    );
  });

  it("throws when the project is unknown", async () => {
    getFindingById.mockResolvedValue(domFinding());
    getProjectById.mockResolvedValue(undefined);
    await expect(runRemediationVerifyJob("f1")).rejects.toThrow(
      /unknown project/i,
    );
  });

  it("skips the apply when the finding drifted during the re-audit", async () => {
    getFindingById
      .mockReset()
      .mockResolvedValueOnce(domFinding())
      .mockResolvedValueOnce(
        domFinding({
          location: {
            kind: "dom",
            url: "https://preview.test/",
            selector: "button",
            snippet: "<button>",
          },
        }),
      );
    getRemediationByFindingId.mockResolvedValue(implementedRemediation());
    runtimeViolationVerification.mockResolvedValue({
      present: false,
      conclusive: true,
    });

    await runRemediationVerifyJob("f1");

    expect(upsertFindings).not.toHaveBeenCalled();
    expect(upsertRemediations).not.toHaveBeenCalled();
  });

  it("verifies a site finding when the re-audit is clean", async () => {
    getFindingById.mockResolvedValue(siteFinding());
    getRemediationByFindingId.mockResolvedValue(implementedRemediation());
    scanRuntime.mockResolvedValue({
      findings: [],
      pagesScanned: 2,
      siteLevelChecksRan: true,
    });

    await runRemediationVerifyJob("f1");

    expect(written().remediations[0]?.status).toBe("verified");
    expect(written().findings[0]?.status).toBe("resolved");
  });

  it("keeps an already-resolved finding resolved on a clean site re-audit", async () => {
    getFindingById.mockResolvedValue(siteFinding({ status: "resolved" }));
    getRemediationByFindingId.mockResolvedValue(implementedRemediation());
    scanRuntime.mockResolvedValue({
      findings: [],
      pagesScanned: 2,
      siteLevelChecksRan: true,
    });

    await runRemediationVerifyJob("f1");

    expect(written().remediations[0]?.status).toBe("verified");
    // Already resolved: no finding row is rewritten.
    expect(written().findings).toHaveLength(0);
  });

  it("records still-failing when the site finding is re-detected", async () => {
    const finding = siteFinding();
    getFindingById.mockResolvedValue(finding);
    getRemediationByFindingId.mockResolvedValue(implementedRemediation());
    scanRuntime.mockResolvedValue({
      findings: [{ location: finding.location }],
      pagesScanned: 2,
      siteLevelChecksRan: true,
    });

    await runRemediationVerifyJob("f1");

    expect(written().remediations).toHaveLength(0);
    expect(
      written().evidence.some(
        (row) => row.kind === "remediation_verification_failed",
      ),
    ).toBe(true);
  });

  it("records a site verdict when no pages were scanned", async () => {
    getFindingById.mockResolvedValue(siteFinding());
    getRemediationByFindingId.mockResolvedValue(implementedRemediation());
    scanRuntime.mockResolvedValue({
      findings: [],
      pagesScanned: 0,
      siteLevelChecksRan: true,
    });

    await runRemediationVerifyJob("f1");

    expect(written().remediations).toHaveLength(0);
    expect(
      written().evidence.some(
        (row) => row.kind === "remediation_verification_failed",
      ),
    ).toBe(true);
  });

  it("records a site verdict when the site checks did not run", async () => {
    getFindingById.mockResolvedValue(siteFinding());
    getRemediationByFindingId.mockResolvedValue(implementedRemediation());
    scanRuntime.mockResolvedValue({
      findings: [],
      pagesScanned: 2,
      siteLevelChecksRan: false,
    });

    await runRemediationVerifyJob("f1");

    expect(written().remediations).toHaveLength(0);
    expect(
      written().evidence.some(
        (row) => row.kind === "remediation_verification_failed",
      ),
    ).toBe(true);
  });

  it("records a preview-unreachable verdict when the scan errors", async () => {
    getFindingById.mockResolvedValue(siteFinding());
    getRemediationByFindingId.mockResolvedValue(implementedRemediation());
    scanRuntime.mockResolvedValue({
      findings: [],
      pagesScanned: 0,
      error: "Runtime scan failed.",
    });

    await runRemediationVerifyJob("f1");

    expect(written().remediations).toHaveLength(0);
    expect(
      written().evidence.some(
        (row) => row.kind === "remediation_verification_failed",
      ),
    ).toBe(true);
  });

  it("fails closed with a timeout verdict when the re-audit never settles", async () => {
    getFindingById.mockResolvedValue(siteFinding());
    getRemediationByFindingId.mockResolvedValue(implementedRemediation());
    scanRuntime.mockImplementation(() => new Promise(() => {}));
    vi.useFakeTimers();
    try {
      const job = runRemediationVerifyJob("f1");
      await vi.advanceTimersByTimeAsync(SITE_VERIFY_TIMEOUT_MS);
      await job;
    } finally {
      vi.useRealTimers();
      scanRuntime.mockReset();
    }

    expect(written().remediations).toHaveLength(0);
    expect(
      written().evidence.some(
        (row) => row.kind === "remediation_verification_failed",
      ),
    ).toBe(true);
  });

  it("propagates a non-timeout re-audit failure", async () => {
    getFindingById.mockResolvedValue(siteFinding());
    getRemediationByFindingId.mockResolvedValue(implementedRemediation());
    scanRuntime.mockRejectedValue(new Error("scan blew up"));

    await expect(runRemediationVerifyJob("f1")).rejects.toThrow("scan blew up");
  });
});

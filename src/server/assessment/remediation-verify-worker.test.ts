import { beforeEach, describe, expect, it, vi } from "vitest";

import { SITE_VERIFY_TIMEOUT_MS } from "@complyloop/analysis-core/contract/assessment-limits";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";

import { testFinding } from "@/test-fixtures/finding";
import { testProject } from "@/test-fixtures/project";
import { testRemediation } from "@/test-fixtures/remediation";

const getDrizzle = vi.hoisted(() => vi.fn());
const getFindingById = vi.hoisted(() => vi.fn());
const getProjectById = vi.hoisted(() => vi.fn());
const listRemediationsForProject = vi.hoisted(() => vi.fn());
const persistProjectRows = vi.hoisted(() => vi.fn());
const withProjectLock = vi.hoisted(() => vi.fn());
const runtimeViolationStillPresent = vi.hoisted(() => vi.fn());
const scanRuntime = vi.hoisted(() => vi.fn());

vi.mock("@complyloop/db/postgres", () => ({
  getDrizzle: (...args: unknown[]) => getDrizzle(...args),
}));

vi.mock("@complyloop/db/repo/findings", () => ({
  getFindingById: (...args: unknown[]) => getFindingById(...args),
}));

vi.mock("@complyloop/db/repo/projects", () => ({
  getProjectById: (...args: unknown[]) => getProjectById(...args),
}));

vi.mock("@complyloop/db/repo/remediations", () => ({
  listRemediationsForProject: (...args: unknown[]) =>
    listRemediationsForProject(...args),
}));

vi.mock("@complyloop/db/repo/apply", async () => {
  const actual = await vi.importActual<
    typeof import("@complyloop/db/repo/apply")
  >("@complyloop/db/repo/apply");
  return {
    ...actual,
    persistProjectRows: (...args: unknown[]) => persistProjectRows(...args),
  };
});

vi.mock("@complyloop/analysis-core/runtime/scan", () => ({
  runtimeViolationStillPresent: (...args: unknown[]) =>
    runtimeViolationStillPresent(...args),
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

beforeEach(() => {
  getDrizzle.mockResolvedValue({});
  // The lock helper runs its callback with an opaque tx handle.
  withProjectLock.mockImplementation(
    async (_projectId: string, fn: (tx: unknown) => unknown) => fn({}),
  );
  getProjectById.mockResolvedValue(project);
  persistProjectRows.mockResolvedValue(undefined);
});

describe("runRemediationVerifyJob", () => {
  it("verifies a dom finding when the re-audit is clean", async () => {
    const finding = domFinding();
    getFindingById.mockResolvedValue(finding);
    listRemediationsForProject.mockResolvedValue([
      testRemediation({ status: "implemented", suggestion: null, history: [] }),
    ]);
    runtimeViolationStillPresent.mockResolvedValue(false);

    await runRemediationVerifyJob("f1");

    const payload = persistProjectRows.mock
      .calls[0]?.[1] as ProjectWritePayload;
    expect(payload.remediations?.[0]?.status).toBe("verified");
    expect(payload.findings?.[0]?.status).toBe("resolved");
    expect(
      payload.evidence?.some((row) => row.kind === "remediation_verified"),
    ).toBe(true);
  });

  it("records still-failing (and re-opens a resolved finding) when detected", async () => {
    const finding = domFinding({ status: "resolved" });
    getFindingById.mockResolvedValue(finding);
    listRemediationsForProject.mockResolvedValue([
      testRemediation({ status: "implemented", suggestion: null, history: [] }),
    ]);
    runtimeViolationStillPresent.mockResolvedValue(true);

    await runRemediationVerifyJob("f1");

    const payload = persistProjectRows.mock
      .calls[0]?.[1] as ProjectWritePayload;
    // Not advanced to verified.
    expect(payload.remediations?.[0]?.status).toBe("implemented");
    expect(payload.findings?.[0]?.status).toBe("open");
    expect(
      payload.evidence?.some(
        (row) => row.kind === "remediation_verification_failed",
      ),
    ).toBe(true);
  });

  it("does nothing when the remediation is no longer implemented", async () => {
    getFindingById.mockResolvedValue(domFinding());
    listRemediationsForProject.mockResolvedValue([
      testRemediation({ status: "verified", suggestion: null, history: [] }),
    ]);
    runtimeViolationStillPresent.mockResolvedValue(false);

    await runRemediationVerifyJob("f1");

    expect(persistProjectRows).not.toHaveBeenCalled();
  });

  it("rejects a source finding (defence in depth)", async () => {
    getFindingById.mockResolvedValue(testFinding());
    listRemediationsForProject.mockResolvedValue([
      testRemediation({ status: "implemented", suggestion: null, history: [] }),
    ]);

    await expect(runRemediationVerifyJob("f1")).rejects.toThrow(
      /draft pull request/i,
    );
    expect(persistProjectRows).not.toHaveBeenCalled();
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
    const finding = domFinding();
    getFindingById
      .mockReset()
      .mockResolvedValueOnce(finding)
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
    listRemediationsForProject.mockResolvedValue([implementedRemediation()]);
    runtimeViolationStillPresent.mockResolvedValue(false);

    await runRemediationVerifyJob("f1");

    expect(persistProjectRows).not.toHaveBeenCalled();
  });

  it("verifies a site finding when the re-audit is clean", async () => {
    getFindingById.mockResolvedValue(siteFinding());
    listRemediationsForProject.mockResolvedValue([implementedRemediation()]);
    scanRuntime.mockResolvedValue({
      findings: [],
      pagesScanned: 2,
      siteLevelChecksRan: true,
    });

    await runRemediationVerifyJob("f1");

    const payload = persistProjectRows.mock
      .calls[0]?.[1] as ProjectWritePayload;
    expect(payload.remediations?.[0]?.status).toBe("verified");
    expect(payload.findings?.[0]?.status).toBe("resolved");
  });

  it("keeps an already-resolved finding resolved on a clean site re-audit", async () => {
    getFindingById.mockResolvedValue(siteFinding({ status: "resolved" }));
    listRemediationsForProject.mockResolvedValue([implementedRemediation()]);
    scanRuntime.mockResolvedValue({
      findings: [],
      pagesScanned: 2,
      siteLevelChecksRan: true,
    });

    await runRemediationVerifyJob("f1");

    const payload = persistProjectRows.mock
      .calls[0]?.[1] as ProjectWritePayload;
    expect(payload.remediations?.[0]?.status).toBe("verified");
    expect(payload.findings?.[0]?.status).toBe("resolved");
  });

  it("records still-failing when the site finding is re-detected", async () => {
    const finding = siteFinding();
    getFindingById.mockResolvedValue(finding);
    listRemediationsForProject.mockResolvedValue([implementedRemediation()]);
    scanRuntime.mockResolvedValue({
      findings: [{ location: finding.location }],
      pagesScanned: 2,
      siteLevelChecksRan: true,
    });

    await runRemediationVerifyJob("f1");

    const payload = persistProjectRows.mock
      .calls[0]?.[1] as ProjectWritePayload;
    expect(payload.remediations?.[0]?.status).toBe("implemented");
    expect(
      payload.evidence?.some(
        (row) => row.kind === "remediation_verification_failed",
      ),
    ).toBe(true);
  });

  it("records a site verdict when no pages were scanned", async () => {
    getFindingById.mockResolvedValue(siteFinding());
    listRemediationsForProject.mockResolvedValue([implementedRemediation()]);
    scanRuntime.mockResolvedValue({
      findings: [],
      pagesScanned: 0,
      siteLevelChecksRan: true,
    });

    await runRemediationVerifyJob("f1");

    const payload = persistProjectRows.mock
      .calls[0]?.[1] as ProjectWritePayload;
    expect(payload.remediations?.[0]?.status).toBe("implemented");
    expect(
      payload.evidence?.some(
        (row) => row.kind === "remediation_verification_failed",
      ),
    ).toBe(true);
  });

  it("records a site verdict when the site checks did not run", async () => {
    getFindingById.mockResolvedValue(siteFinding());
    listRemediationsForProject.mockResolvedValue([implementedRemediation()]);
    scanRuntime.mockResolvedValue({
      findings: [],
      pagesScanned: 2,
      siteLevelChecksRan: false,
    });

    await runRemediationVerifyJob("f1");

    const payload = persistProjectRows.mock
      .calls[0]?.[1] as ProjectWritePayload;
    expect(payload.remediations?.[0]?.status).toBe("implemented");
    expect(
      payload.evidence?.some(
        (row) => row.kind === "remediation_verification_failed",
      ),
    ).toBe(true);
  });

  it("records a preview-unreachable verdict when the scan errors", async () => {
    getFindingById.mockResolvedValue(siteFinding());
    listRemediationsForProject.mockResolvedValue([implementedRemediation()]);
    scanRuntime.mockResolvedValue({
      findings: [],
      pagesScanned: 0,
      error: "Runtime scan failed.",
    });

    await runRemediationVerifyJob("f1");

    const payload = persistProjectRows.mock
      .calls[0]?.[1] as ProjectWritePayload;
    expect(payload.remediations?.[0]?.status).toBe("implemented");
    expect(
      payload.evidence?.some(
        (row) => row.kind === "remediation_verification_failed",
      ),
    ).toBe(true);
  });

  it("fails closed with a timeout verdict when the re-audit never settles", async () => {
    getFindingById.mockResolvedValue(siteFinding());
    listRemediationsForProject.mockResolvedValue([implementedRemediation()]);
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

    const payload = persistProjectRows.mock
      .calls[0]?.[1] as ProjectWritePayload;
    expect(payload.remediations?.[0]?.status).toBe("implemented");
    expect(
      payload.evidence?.some(
        (row) => row.kind === "remediation_verification_failed",
      ),
    ).toBe(true);
  });

  it("propagates a non-timeout re-audit failure", async () => {
    getFindingById.mockResolvedValue(siteFinding());
    listRemediationsForProject.mockResolvedValue([implementedRemediation()]);
    scanRuntime.mockRejectedValue(new Error("scan blew up"));

    await expect(runRemediationVerifyJob("f1")).rejects.toThrow("scan blew up");
  });
});

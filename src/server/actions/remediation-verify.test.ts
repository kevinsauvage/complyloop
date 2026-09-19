import "@/test-fixtures/register-action-workspace-mock";

import { afterEach, describe, expect, it, vi } from "vitest";

import { SITE_VERIFY_TIMEOUT_MS } from "@complyloop/analysis-core/contract/assessment-limits";
import type { WorkspaceSlice } from "@complyloop/db/types";

import { initialActionState } from "@/core/action-state";
import {
  actionWorkspaceMocks,
  clearProjectWritePayloads,
  mockProjectWrite,
  projectWritePayload,
} from "@/test-fixtures/action-workspace-mocks";
import { testFinding } from "@/test-fixtures/finding";
import { testProject } from "@/test-fixtures/project";
import { testRemediation } from "@/test-fixtures/remediation";
import { testWorkspace } from "@/test-fixtures/workspace";

import type { Workspace } from "../workspace/workspace";
import {
  attestRemediationVerifiedAction,
  markRemediationImplementedAction,
  verifyRemediationAction,
} from "./remediation-verify";

const { getWorkspace } = actionWorkspaceMocks;
const locateViolationInProject = vi.hoisted(() => vi.fn());
const runtimeViolationStillPresent = vi.hoisted(() => vi.fn());
const scanRuntime = vi.hoisted(() => vi.fn());
const applyRequirementStatusRefresh = vi.hoisted(() => vi.fn());
const assertRemediationRateLimit = vi.hoisted(() => vi.fn());

vi.mock("../rate-limit", async () => {
  const actual =
    await vi.importActual<typeof import("../rate-limit")>("../rate-limit");
  return {
    ...actual,
    assertRemediationRateLimit: (...args: unknown[]) =>
      assertRemediationRateLimit(...args),
  };
});

vi.mock("../assessment/repo-checkout", () => ({
  withProjectCheckout: async (
    _project: unknown,
    fn: (rootPath: string) => Promise<unknown>,
  ) => fn("/tmp/ephemeral-checkout"),
  withRepoCheckout: vi.fn(),
}));

vi.mock("../observability", () => ({
  reportError: vi.fn(),
  reportWarning: vi.fn(),
  reportAppError: vi.fn(),
}));

vi.mock("../assessment/assessment-findings", async () => {
  const actual = await vi.importActual<
    typeof import("../assessment/assessment-findings")
  >("../assessment/assessment-findings");
  return {
    ...actual,
    buildSuggestion: vi.fn(() => null),
    locateViolationInProject: (...args: unknown[]) =>
      locateViolationInProject(...args),
    mergeFix: vi.fn((existing, fresh) => fresh ?? existing),
  };
});

vi.mock("../assessment/assessment-status", async () => {
  const actual = await vi.importActual<
    typeof import("../assessment/assessment-status")
  >("../assessment/assessment-status");
  return {
    ...actual,
    applyRequirementStatusRefresh: (...args: unknown[]) =>
      applyRequirementStatusRefresh(...args),
  };
});

vi.mock("@complyloop/analysis-core/runtime/scan", () => ({
  runtimeViolationStillPresent: (...args: unknown[]) =>
    runtimeViolationStillPresent(...args),
  scanRuntime: (...args: unknown[]) => scanRuntime(...args),
}));

const project = testProject({ orgId: "org-1" });
const finding = testFinding();

function baseWorkspace(
  overrides: Partial<WorkspaceSlice> = {},
  role: "member" | "viewer" = "member",
): Workspace {
  const { findings, remediations, ...rest } = overrides;
  return testWorkspace({
    role,
    userId: "user-1",
    project,
    findings: findings ?? [finding],
    remediations: remediations ?? [
      testRemediation({ status: "implemented", suggestion: null, history: [] }),
    ],
    db: {
      requirements: [],
      alerts: [],
      ...rest,
    },
  });
}

afterEach(() => {
  clearProjectWritePayloads();
  vi.clearAllMocks();
});

describe("verifyRemediationAction", () => {
  it("denies viewers before running any re-audit", async () => {
    const viewer = baseWorkspace({}, "viewer");
    viewer.access.memberships = [];
    getWorkspace.mockResolvedValue(viewer);

    const result = await verifyRemediationAction(
      "f1",
      initialActionState,
      new FormData(),
    );

    expect(result.ok ? null : result.message).toMatch(/Not allowed/);
    expect(scanRuntime).not.toHaveBeenCalled();
    expect(runtimeViolationStillPresent).not.toHaveBeenCalled();
    expect(projectWritePayload()).toBeUndefined();
  });

  it("refuses to verify a source finding by applying a local patch", async () => {
    const workspace = baseWorkspace();
    getWorkspace.mockResolvedValue(workspace);

    const result = await verifyRemediationAction(
      "f1",
      initialActionState,
      new FormData(),
    );

    expect(result.ok ? null : result.message).toMatch(
      /draft pull request|re-assess/i,
    );
    expect(projectWritePayload()).toBeUndefined();
    expect(locateViolationInProject).not.toHaveBeenCalled();
  });

  it("rejects automated verify until the remediation is implemented", async () => {
    const workspace = baseWorkspace({
      remediations: [
        testRemediation({ status: "approved", suggestion: null, history: [] }),
      ],
    });
    getWorkspace.mockResolvedValue(workspace);

    const result = await verifyRemediationAction(
      "f1",
      initialActionState,
      new FormData(),
    );

    expect(result.ok ? null : result.message).toMatch(/implemented/);
    expect(projectWritePayload()).toBeUndefined();
  });

  it("rejects when a concurrent write already verified the remediation", async () => {
    const domFinding = testFinding({
      location: {
        kind: "dom",
        url: "https://preview.test/",
        selector: "img",
        snippet: "<img>",
      },
    });
    const preview = baseWorkspace({
      findings: [domFinding],
      remediations: [
        testRemediation({
          status: "implemented",
          suggestion: null,
          history: [],
        }),
      ],
    });
    const locked = baseWorkspace({
      findings: [domFinding],
      remediations: [
        testRemediation({ status: "verified", suggestion: null, history: [] }),
      ],
    });
    getWorkspace.mockResolvedValue(preview);
    mockProjectWrite(locked);
    runtimeViolationStillPresent.mockResolvedValue(false);

    const result = await verifyRemediationAction(
      "f1",
      initialActionState,
      new FormData(),
    );

    expect(result.ok ? null : result.message).toMatch(/implemented/);
    expect(projectWritePayload()).toBeUndefined();
  });

  it("verifies a runtime finding when the DOM re-audit is clean", async () => {
    const workspace = baseWorkspace({
      findings: [
        testFinding({
          location: {
            kind: "dom",
            url: "https://preview.test/",
            selector: "img",
            snippet: "<img>",
          },
        }),
      ],
    });
    getWorkspace.mockResolvedValue(workspace);
    mockProjectWrite(workspace);
    runtimeViolationStillPresent.mockResolvedValue(false);

    const result = await verifyRemediationAction(
      "f1",
      initialActionState,
      new FormData(),
    );

    expect(result).toEqual({
      ok: true,
      message: "Fix verified by automated re-check.",
    });
    expect(projectWritePayload()?.remediations?.[0]?.status).toBe("verified");
    expect(projectWritePayload()?.findings?.[0]?.status).toBe("resolved");
    expect(assertRemediationRateLimit).toHaveBeenCalled();
    expect(applyRequirementStatusRefresh).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ id: "p1" }),
      expect.objectContaining({
        controlIds: ["ctl-img-alt"],
        runtimeRan: true,
      }),
    );
  });

  it("verifies a site-level finding only after a clean site-level re-audit", async () => {
    const workspace = baseWorkspace({
      findings: [
        testFinding({
          checkId: "consistent-nav",
          location: {
            kind: "site",
            pages: ["/", "/about"],
            detail: "Navigation differs across pages",
          },
        }),
      ],
    });
    getWorkspace.mockResolvedValue(workspace);
    mockProjectWrite(workspace);
    scanRuntime.mockResolvedValue({
      findings: [],
      pagesScanned: 2,
      siteLevelChecksRan: true,
    });

    const result = await verifyRemediationAction(
      "f1",
      initialActionState,
      new FormData(),
    );

    expect(result).toEqual({
      ok: true,
      message: "Fix verified by automated re-check.",
    });
    expect(locateViolationInProject).not.toHaveBeenCalled();
    // Only the finding's own pages are re-audited, not the project's full
    // route set.
    expect(scanRuntime).toHaveBeenCalledWith(
      expect.objectContaining({ runtimeRoutes: ["/", "/about"] }),
    );
    expect(projectWritePayload()?.remediations?.[0]?.status).toBe("verified");
    expect(applyRequirementStatusRefresh).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ id: "p1" }),
      expect.objectContaining({
        controlIds: ["ctl-img-alt"],
        runtimeRan: true,
        siteLevelChecksRan: true,
      }),
    );
  });

  it("does not verify a site-level finding when the site-level audit did not run", async () => {
    const workspace = baseWorkspace({
      findings: [
        testFinding({
          checkId: "consistent-nav",
          location: {
            kind: "site",
            pages: ["/", "/about"],
            detail: "Navigation differs across pages",
          },
        }),
      ],
    });
    getWorkspace.mockResolvedValue(workspace);
    mockProjectWrite(workspace);
    scanRuntime.mockResolvedValue({
      findings: [],
      pagesScanned: 1,
      siteLevelChecksRan: false,
    });

    const result = await verifyRemediationAction(
      "f1",
      initialActionState,
      new FormData(),
    );

    expect(result.message).toMatch(/Site checks did not run/i);
    expect(result.ok ? null : result.message).toBeNull();
    expect(projectWritePayload()?.remediations?.[0]?.status).toBe(
      "implemented",
    );
  });

  it("fails closed with a timeout message when the site re-audit hangs", async () => {
    const workspace = baseWorkspace({
      findings: [
        testFinding({
          checkId: "consistent-nav",
          location: {
            kind: "site",
            pages: ["/", "/about"],
            detail: "Navigation differs across pages",
          },
        }),
      ],
    });
    getWorkspace.mockResolvedValue(workspace);
    mockProjectWrite(workspace);
    scanRuntime.mockReturnValue(new Promise(() => {}));

    vi.useFakeTimers();
    try {
      const pending = verifyRemediationAction(
        "f1",
        initialActionState,
        new FormData(),
      );
      await vi.advanceTimersByTimeAsync(SITE_VERIFY_TIMEOUT_MS + 1);
      const result = await pending;

      expect(result.message).toMatch(/timed out/i);
      expect(scanRuntime).toHaveBeenCalledTimes(1);
      // Fail closed: recorded as still-failing, never verified.
      expect(projectWritePayload()?.remediations?.[0]?.status).toBe(
        "implemented",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports still-failing when the runtime finding is still on the page", async () => {
    const workspace = baseWorkspace({
      findings: [
        testFinding({
          location: {
            kind: "dom",
            url: "https://preview.test/",
            selector: "img",
            snippet: "<img>",
          },
        }),
      ],
    });
    getWorkspace.mockResolvedValue(workspace);
    mockProjectWrite(workspace);
    runtimeViolationStillPresent.mockResolvedValue(true);

    const result = await verifyRemediationAction(
      "f1",
      initialActionState,
      new FormData(),
    );

    expect(result.message).toMatch(/still failing|still detected/i);
    expect(result.ok ? null : result.message).toBeNull();
    expect(projectWritePayload()?.remediations?.[0]?.status).toBe(
      "implemented",
    );
  });

  it("verifies a resolved runtime finding when the DOM re-audit is clean", async () => {
    const resolvedFinding = testFinding({
      status: "resolved",
      resolvedNote: "No longer detected by the latest assessment.",
      location: {
        kind: "dom",
        url: "https://preview.test/",
        selector: "img",
        snippet: "<img>",
      },
    });
    const workspace = baseWorkspace({
      findings: [resolvedFinding],
    });
    getWorkspace.mockResolvedValue(workspace);
    mockProjectWrite(workspace);
    runtimeViolationStillPresent.mockResolvedValue(false);

    const result = await verifyRemediationAction(
      "f1",
      initialActionState,
      new FormData(),
    );

    expect(result).toEqual({
      ok: true,
      message: "Fix verified by automated re-check.",
    });
    expect(projectWritePayload()?.remediations?.[0]?.status).toBe("verified");
    // The resolution stands — the finding row is untouched by the verify.
    expect(projectWritePayload()?.findings?.[0]?.status).toBe("resolved");
  });

  it("re-opens a resolved finding when the re-audit still detects it", async () => {
    const resolvedFinding = testFinding({
      status: "resolved",
      resolvedNote: "No longer detected by the latest assessment.",
      location: {
        kind: "dom",
        url: "https://preview.test/",
        selector: "img",
        snippet: "<img>",
      },
    });
    const workspace = baseWorkspace({
      findings: [resolvedFinding],
    });
    getWorkspace.mockResolvedValue(workspace);
    mockProjectWrite(workspace);
    runtimeViolationStillPresent.mockResolvedValue(true);

    const result = await verifyRemediationAction(
      "f1",
      initialActionState,
      new FormData(),
    );

    expect(result.message).toMatch(/still failing|still detected/i);
    expect(projectWritePayload()?.findings?.[0]?.status).toBe("open");
  });

  it("rejects verify for a dismissed finding", async () => {
    const workspace = baseWorkspace({
      findings: [
        testFinding({
          status: "dismissed",
          dismissal: {
            reason: "false_positive",
            note: "decorative",
            at: "2026-01-01T00:00:00.000Z",
          },
          location: {
            kind: "dom",
            url: "https://preview.test/",
            selector: "img",
            snippet: "<img>",
          },
        }),
      ],
    });
    getWorkspace.mockResolvedValue(workspace);
    mockProjectWrite(workspace);
    runtimeViolationStillPresent.mockResolvedValue(false);

    const result = await verifyRemediationAction(
      "f1",
      initialActionState,
      new FormData(),
    );

    expect(result.ok ? null : result.message).toMatch(/no longer open/i);
    expect(projectWritePayload()).toBeUndefined();
  });
});

describe("attestRemediationVerifiedAction", () => {
  function noteForm(note: string): FormData {
    const form = new FormData();
    form.set("note", note);
    return form;
  }

  it("marks a resolved finding verified with manual confirmation", async () => {
    const resolvedFinding = testFinding({
      status: "resolved",
      resolvedNote: "No longer detected by the latest assessment.",
      location: {
        kind: "dom",
        url: "https://preview.test/",
        selector: "img",
        snippet: "<img>",
      },
    });
    const workspace = baseWorkspace({
      findings: [resolvedFinding],
    });
    getWorkspace.mockResolvedValue(workspace);
    mockProjectWrite(workspace);

    const result = await attestRemediationVerifiedAction(
      "f1",
      initialActionState,
      noteForm("Confirmed fixed on the staging deploy."),
    );

    expect(result).toEqual({
      ok: true,
      message: "Fix marked verified with manual confirmation.",
    });
    expect(projectWritePayload()?.remediations?.[0]?.status).toBe("verified");
    const evidence = projectWritePayload()?.evidence ?? [];
    expect(
      evidence.some((item) => item.kind === "remediation_manually_verified"),
    ).toBe(true);
    expect(runtimeViolationStillPresent).not.toHaveBeenCalled();
  });

  it("requires a confirmation note", async () => {
    const workspace = baseWorkspace({
      findings: [testFinding({ status: "resolved" })],
    });
    getWorkspace.mockResolvedValue(workspace);

    const result = await attestRemediationVerifiedAction(
      "f1",
      initialActionState,
      new FormData(),
    );

    expect(result.ok ? null : result.message).toMatch(/note/i);
    expect(projectWritePayload()).toBeUndefined();
  });

  it("refuses attestation for open findings and source locations", async () => {
    const openDom = baseWorkspace({
      findings: [
        testFinding({
          location: {
            kind: "dom",
            url: "https://preview.test/",
            selector: "img",
            snippet: "<img>",
          },
        }),
      ],
    });
    getWorkspace.mockResolvedValue(openDom);

    const openResult = await attestRemediationVerifiedAction(
      "f1",
      initialActionState,
      noteForm("Looks fixed."),
    );
    expect(openResult.ok ? null : openResult.message).toMatch(
      /resolved findings/,
    );

    const sourceResolved = baseWorkspace({
      findings: [testFinding({ status: "resolved" })],
    });
    getWorkspace.mockResolvedValue(sourceResolved);
    const sourceResult = await attestRemediationVerifiedAction(
      "f1",
      initialActionState,
      noteForm("Looks fixed."),
    );
    expect(sourceResult.ok ? null : sourceResult.message).toMatch(
      /draft pull request/i,
    );
    expect(projectWritePayload()).toBeUndefined();
  });
});

describe("markRemediationImplementedAction", () => {
  it("advances an approved remediation to implemented", async () => {
    const workspace = baseWorkspace({
      remediations: [
        {
          id: "r1",
          findingId: "f1",
          status: "approved",
          suggestion: null,
          history: [],
        },
      ],
    });
    mockProjectWrite(workspace);
    const form = new FormData();
    form.set("note", "Fixed in PR #9");

    const result = await markRemediationImplementedAction(
      "f1",
      initialActionState,
      form,
    );

    expect(result.message).toMatch(/implemented/i);
    expect(projectWritePayload()?.remediations?.[0]?.status).toBe(
      "implemented",
    );
  });

  it("rejects a remediation that is not approved", async () => {
    const workspace = baseWorkspace({
      remediations: [
        testRemediation({ status: "verified", suggestion: null, history: [] }),
      ],
    });
    mockProjectWrite(workspace);

    const result = await markRemediationImplementedAction(
      "f1",
      initialActionState,
      new FormData(),
    );

    expect(result.ok ? null : result.message).toMatch(/approved/);
    expect(projectWritePayload()).toBeUndefined();
  });
});

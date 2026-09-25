import "@/test-fixtures/register-action-workspace-mock";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceSlice } from "@complyloop/db/types";

import { initialActionState } from "@/core/actions/action-state";
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
const enqueueAssessmentJob = vi.hoisted(() => vi.fn());
const recoverExpiredAssessmentLeases = vi.hoisted(() => vi.fn());
const scheduleAssessmentDrain = vi.hoisted(() => vi.fn());
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

vi.mock("../assessment/assessment-jobs", async () => {
  const actual = await vi.importActual<
    typeof import("../assessment/assessment-jobs")
  >("../assessment/assessment-jobs");
  return {
    ...actual,
    enqueueAssessmentJob: (...args: unknown[]) => enqueueAssessmentJob(...args),
    recoverExpiredAssessmentLeases: (...args: unknown[]) =>
      recoverExpiredAssessmentLeases(...args),
  };
});

vi.mock("../assessment/assessment-scheduler", async () => {
  const actual = await vi.importActual<
    typeof import("../assessment/assessment-scheduler")
  >("../assessment/assessment-scheduler");
  return {
    ...actual,
    scheduleAssessmentDrain: (...args: unknown[]) =>
      scheduleAssessmentDrain(...args),
  };
});

vi.mock("../observability", () => ({
  reportError: vi.fn(),
  reportWarning: vi.fn(),
  reportAppError: vi.fn(),
}));

// This suite runs on the inline-drain path (dev/e2e) so the enqueue result
// surfaces as the action's return message without needing `after()`.
vi.mock("../e2e-harness", async () => {
  const actual =
    await vi.importActual<typeof import("../e2e-harness")>("../e2e-harness");
  return { ...actual, isE2EHarnessEnabled: () => true };
});

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

const domFinding = () =>
  testFinding({
    location: {
      kind: "dom",
      url: "https://preview.test/",
      selector: "img",
      snippet: "<img>",
    },
  });

afterEach(() => {
  clearProjectWritePayloads();
  vi.clearAllMocks();
  scheduleAssessmentDrain.mockReset();
  enqueueAssessmentJob.mockReset();
});

describe("verifyRemediationAction", () => {
  it("denies viewers before enqueueing", async () => {
    const viewer = baseWorkspace({}, "viewer");
    viewer.access.memberships = [];
    getWorkspace.mockResolvedValue(viewer);

    const result = await verifyRemediationAction(
      "f1",
      initialActionState,
      new FormData(),
    );

    expect(result.ok ? null : result.message).toMatch(/Not allowed/);
    expect(enqueueAssessmentJob).not.toHaveBeenCalled();
    expect(projectWritePayload()).toBeUndefined();
  });

  it("refuses to verify a source finding", async () => {
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
    expect(enqueueAssessmentJob).not.toHaveBeenCalled();
    expect(projectWritePayload()).toBeUndefined();
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
    expect(enqueueAssessmentJob).not.toHaveBeenCalled();
    expect(projectWritePayload()).toBeUndefined();
  });

  it("enqueues a verify_remediation job for a runtime finding", async () => {
    const workspace = baseWorkspace({ findings: [domFinding()] });
    getWorkspace.mockResolvedValue(workspace);
    mockProjectWrite(workspace);
    enqueueAssessmentJob.mockResolvedValue({
      id: "job-1",
      projectId: "p1",
      status: "queued",
      trigger: "verify_remediation",
      payload: { findingId: "f1" },
      attempts: 0,
      maxAttempts: 3,
      availableAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    scheduleAssessmentDrain.mockResolvedValue(
      "Fix verified by automated re-check.",
    );

    const result = await verifyRemediationAction(
      "f1",
      initialActionState,
      new FormData(),
    );

    expect(enqueueAssessmentJob).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "p1",
        trigger: "verify_remediation",
        payload: { findingId: "f1" },
      }),
    );
    expect(result.ok ? result.message : null).toMatch(/verified|queued/i);
    expect(projectWritePayload()?.evidence?.[0]?.kind).toBe("assessment_job");
    expect(assertRemediationRateLimit).toHaveBeenCalled();
  });

  it("re-checks source location and remediation under the lock", async () => {
    const live = baseWorkspace({ findings: [domFinding()] });
    getWorkspace.mockResolvedValue(live);

    const sourceLive = baseWorkspace({ findings: [testFinding()] });
    mockProjectWrite(sourceLive);
    const sourceResult = await verifyRemediationAction(
      "f1",
      initialActionState,
      new FormData(),
    );
    expect(sourceResult.ok ? null : sourceResult.message).toMatch(
      /draft pull request|re-assess/i,
    );
    expect(projectWritePayload()).toBeUndefined();

    const staleRemediation = baseWorkspace({
      findings: [domFinding()],
      remediations: [
        testRemediation({ status: "approved", suggestion: null, history: [] }),
      ],
    });
    mockProjectWrite(staleRemediation);
    const staleResult = await verifyRemediationAction(
      "f1",
      initialActionState,
      new FormData(),
    );
    expect(staleResult.ok ? null : staleResult.message).toMatch(/implemented/);
    expect(projectWritePayload()).toBeUndefined();
  });

  it("rejects a dismissed finding", async () => {
    const workspace = baseWorkspace({
      findings: [
        testFinding({
          status: "dismissed",
          dismissal: {
            reason: "false_positive",
            note: "decorative",
            at: "2026-01-01T00:00:00.000Z",
          },
          location: domFinding().location,
        }),
      ],
    });
    getWorkspace.mockResolvedValue(workspace);
    mockProjectWrite(workspace);

    const result = await verifyRemediationAction(
      "f1",
      initialActionState,
      new FormData(),
    );

    expect(enqueueAssessmentJob).not.toHaveBeenCalled();
    expect(projectWritePayload()).toBeUndefined();
    expect(result.ok ? result.message : "").not.toMatch(/verified/i);
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
    expect(enqueueAssessmentJob).not.toHaveBeenCalled();
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

  it("refuses attestation when the preview remediation is not implemented", async () => {
    const workspace = baseWorkspace({
      findings: [
        testFinding({
          status: "resolved",
          location: domFinding().location,
        }),
      ],
      remediations: [
        testRemediation({ status: "approved", suggestion: null, history: [] }),
      ],
    });
    getWorkspace.mockResolvedValue(workspace);

    const result = await attestRemediationVerifiedAction(
      "f1",
      initialActionState,
      noteForm("Looks fixed."),
    );
    expect(result.ok ? null : result.message).toMatch(/implemented/);
    expect(projectWritePayload()).toBeUndefined();
  });

  it("re-checks resolution, identity, and remediation under the lock", async () => {
    const resolved = (selector: string) =>
      testFinding({
        status: "resolved",
        location: {
          kind: "dom",
          url: "https://preview.test/",
          selector,
          snippet: "<img>",
        },
      });
    const note = noteForm("Confirmed fixed.");

    const live = baseWorkspace({ findings: [resolved("img")] });
    getWorkspace.mockResolvedValue(live);

    mockProjectWrite(baseWorkspace({ findings: [domFinding()] }));
    const reopened = await attestRemediationVerifiedAction(
      "f1",
      initialActionState,
      note,
    );
    expect(reopened.ok ? null : reopened.message).toMatch(/resolved findings/);
    expect(projectWritePayload()).toBeUndefined();

    mockProjectWrite(baseWorkspace({ findings: [resolved("img.other")] }));
    const moved = await attestRemediationVerifiedAction(
      "f1",
      initialActionState,
      note,
    );
    expect(moved.ok ? null : moved.message).toMatch(/changed since load/);
    expect(projectWritePayload()).toBeUndefined();

    mockProjectWrite(
      baseWorkspace({
        findings: [resolved("img")],
        remediations: [
          testRemediation({
            status: "approved",
            suggestion: null,
            history: [],
          }),
        ],
      }),
    );
    const stale = await attestRemediationVerifiedAction(
      "f1",
      initialActionState,
      note,
    );
    expect(stale.ok ? null : stale.message).toMatch(/implemented/);
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

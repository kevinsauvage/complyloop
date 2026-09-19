import { afterEach, describe, expect, it, vi } from "vitest";

import {
  postPullRequestCheckRun,
  summarizeAssessmentForCheckRun,
  summarizeInProgressCheckRun,
  summarizeQueuedCheckRun,
} from "./github-checks";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("summarizeAssessmentForCheckRun", () => {
  it("returns success when there are no open failures", () => {
    const result = summarizeAssessmentForCheckRun({
      openViolations: 0,
      failedRequirements: 0,
      assessmentId: "a1",
    });
    expect(result.conclusion).toBe("success");
    expect(result.title).toMatch(/passed/i);
  });

  it("returns failure when violations or failed requirements exist", () => {
    const result = summarizeAssessmentForCheckRun({
      openViolations: 2,
      failedRequirements: 1,
      assessmentId: "a2",
    });
    expect(result.conclusion).toBe("failure");
    expect(result.summary).toContain("Open violations: 2");
  });

  it("includes the severity breakdown when provided", () => {
    const result = summarizeAssessmentForCheckRun({
      openViolations: 3,
      failedRequirements: 1,
      assessmentId: "a3",
      severity: { critical: 1, serious: 2 },
    });
    expect(result.summary).toContain("critical 1");
    expect(result.summary).toContain("serious 2");
  });

  it("omits the severity line when no breakdown is provided", () => {
    const result = summarizeAssessmentForCheckRun({
      openViolations: 0,
      failedRequirements: 0,
      assessmentId: "a4",
    });
    expect(result.summary).not.toContain("Severity:");
  });
});

describe("queued/in_progress summaries", () => {
  it("describes the queued state with the job id", () => {
    const result = summarizeQueuedCheckRun("job-1");
    expect(result.title).toMatch(/queued/i);
    expect(result.summary).toContain("job-1");
  });

  it("describes the in-progress state with the job id", () => {
    const result = summarizeInProgressCheckRun("job-1");
    expect(result.title).toMatch(/in progress/i);
    expect(result.summary).toContain("job-1");
  });
});

describe("postPullRequestCheckRun", () => {
  it("posts a completed check run to the GitHub Checks API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          id: 42,
          html_url: "https://github.com/acme/shop/runs/42",
        },
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await postPullRequestCheckRun({
      fullName: "acme/shop",
      headSha: "abc123",
      token: "gho_token",
      conclusion: "failure",
      title: "2 open violations",
      summary: "details",
    });

    expect(result.ok).toBe(true);
    expect(result.checkRunId).toBe(42);
    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { method?: string; body?: string },
    ];
    expect(url).toContain("/repos/acme/shop/check-runs");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body ?? "{}") as {
      head_sha: string;
      conclusion: string;
      name: string;
    };
    expect(body.head_sha).toBe("abc123");
    expect(body.conclusion).toBe("failure");
    expect(body.name).toBe("ComplyLoop");
  });

  it("surfaces API errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { message: "Resource not accessible" },
            { status: 403 },
          ),
        ),
    );
    const result = await postPullRequestCheckRun({
      fullName: "acme/shop",
      headSha: "abc123",
      token: "gho_token",
      conclusion: "success",
      title: "ok",
      summary: "ok",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/403|Checks API/i);
  });

  it("posts queued/in_progress without a conclusion (API rejects it)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ id: 7, html_url: null }, { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await postPullRequestCheckRun({
      fullName: "acme/shop",
      headSha: "abc123",
      token: "gho_token",
      status: "in_progress",
      title: "scanning",
      summary: "in progress",
    });

    expect(result.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as [
      string,
      { method?: string; body?: string },
    ];
    const body = JSON.parse(init.body ?? "{}") as Record<string, unknown>;
    expect(body.status).toBe("in_progress");
    expect(body).not.toHaveProperty("conclusion");
  });

  it("sends details_url and external_id on completed runs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ id: 8, html_url: null }, { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await postPullRequestCheckRun({
      fullName: "acme/shop",
      headSha: "abc123",
      token: "gho_token",
      status: "completed",
      conclusion: "failure",
      title: "2 open violations",
      summary: "details",
      detailsUrl: "https://app.example/projects/p1/assessments/a1",
      externalId: "job-1",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:05:00.000Z",
    });

    const [, init] = fetchMock.mock.calls[0] as [
      string,
      { method?: string; body?: string },
    ];
    const body = JSON.parse(init.body ?? "{}") as Record<string, unknown>;
    expect(body.details_url).toBe(
      "https://app.example/projects/p1/assessments/a1",
    );
    expect(body.external_id).toBe("job-1");
    expect(body.started_at).toBe("2026-01-01T00:00:00.000Z");
    expect(body.completed_at).toBe("2026-01-01T00:05:00.000Z");
  });

  it("never throws on API errors — warn-only contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );
    await expect(
      postPullRequestCheckRun({
        fullName: "acme/shop",
        headSha: "abc123",
        token: "gho_token",
        status: "queued",
        title: "queued",
        summary: "queued",
      }),
    ).resolves.toEqual(
      expect.objectContaining({ ok: false, error: expect.any(String) }),
    );
  });
});

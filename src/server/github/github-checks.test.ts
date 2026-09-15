import { afterEach, describe, expect, it, vi } from "vitest";

import {
  postPullRequestCheckRun,
  summarizeAssessmentForCheckRun,
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
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../observability", () => ({
  reportWarning: vi.fn(),
}));

import { reportWarning } from "../observability";
import {
  ASSESSMENT_DRAIN_EVENT_TYPE,
  dispatchAssessmentWorker,
} from "./assessment-job-dispatch";

const warned = vi.mocked(reportWarning);

beforeEach(() => {
  vi.stubEnv("GH_WORKER_DISPATCH_TOKEN", "gh-pat");
  vi.stubEnv("APP_REPO_FULL_NAME", "octo/app");
  vi.stubEnv("VERCEL_GIT_REPO_OWNER", "");
  vi.stubEnv("VERCEL_GIT_REPO_SLUG", "");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 204 }));
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("dispatchAssessmentWorker", () => {
  it("posts repository_dispatch and returns true on accept", async () => {
    await expect(dispatchAssessmentWorker()).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/octo/app/dispatches",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ event_type: ASSESSMENT_DRAIN_EVENT_TYPE }),
      }),
    );
    expect(warned).not.toHaveBeenCalled();
  });

  it("returns false without dispatching when unconfigured", async () => {
    vi.stubEnv("GH_WORKER_DISPATCH_TOKEN", "");

    await expect(dispatchAssessmentWorker()).resolves.toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns false and warns when GitHub rejects the event", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("nope", { status: 401 }),
    );

    await expect(dispatchAssessmentWorker()).resolves.toBe(false);
    expect(warned).toHaveBeenCalledWith(
      "assessment worker dispatch failed",
      expect.objectContaining({
        code: "assessment_worker_dispatch_failed",
      }),
    );
  });

  it("never throws and never logs the token", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network down"));

    await expect(dispatchAssessmentWorker()).resolves.toBe(false);
    for (const call of warned.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("gh-pat");
    }
  });

  it("bounds the kick with a timeout signal", async () => {
    await expect(dispatchAssessmentWorker()).resolves.toBe(true);
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

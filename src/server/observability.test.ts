import * as Sentry from "@sentry/nextjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  reportAppError,
  reportDebug,
  reportError,
  reportInfo,
  reportWarning,
} from "./observability";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** Returns the raw (uncolored) lines written to a stream during `callback`. */
function captureOutput(
  stream: NodeJS.WriteStream,
  callback: () => void,
): string {
  const chunks: string[] = [];
  const spy = vi
    .spyOn(stream, "write")
    .mockImplementation((chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    });
  callback();
  spy.mockRestore();
  return chunks.join("").replace(/\x1b\[[0-9;]*m/g, "");
}

describe("observability", () => {
  it("emits a readable error line with context to stderr", () => {
    const out = captureOutput(process.stderr, () =>
      reportError(new Error("workspace missing"), {
        code: "workspace_missing",
        projectId: "p1",
      }),
    );
    expect(out).toContain("ERR");
    expect(out).toContain("workspace missing");
    expect(out).toContain(`code="workspace_missing"`);
    expect(out).toContain(`projectId="p1"`);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "workspace missing" }),
    );
  });

  it("emits a readable warning line to stderr", () => {
    const out = captureOutput(process.stderr, () =>
      reportWarning("token decrypt failed", { code: "token_decrypt" }),
    );
    expect(out).toContain("WRN");
    expect(out).toContain("token decrypt failed");
    expect(out).toContain(`code="token_decrypt"`);
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "token decrypt failed",
      "warning",
    );
  });

  it("logs info/debug in development to stdout", () => {
    vi.stubEnv("NODE_ENV", "development");
    const out = captureOutput(process.stdout, () => {
      reportInfo("assessment started", { code: "assessment_started" });
      reportDebug("page evaluate", { url: "/" });
    });
    expect(out).toContain("INF");
    expect(out).toContain("assessment started");
    expect(out).toContain("DBG");
    expect(out).toContain("page evaluate");
  });

  it("silences info/debug in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    let written = false;
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => {
        written = true;
        return true;
      });
    reportInfo("should not appear", {});
    reportDebug("should not appear", {});
    expect(written).toBe(false);
    spy.mockRestore();
  });

  it("reportAppError forwards digest and code", () => {
    const out = captureOutput(process.stderr, () =>
      reportAppError(Object.assign(new Error("boom"), { digest: "d-1" }), "app_error_boundary"),
    );
    expect(out).toContain(`code="app_error_boundary"`);
    expect(out).toContain(`digest="d-1"`);
    expect(out).toContain("boom");
  });

  it("redacts credentials from logged message and stack before reporting", () => {
    const dbUrl = "postgres://app:hunter2@db.internal:5432/prod";
    const token = "ghp_secret_token_123456";
    const error = new Error(`connect failed for ${dbUrl} token=${token}`);
    error.stack = `Error: connect failed for ${dbUrl} token=${token}\n    at connect`;
    const out = captureOutput(process.stderr, () =>
      reportError(error, { code: "db_error" }),
    );

    expect(out).not.toContain("hunter2");
    expect(out).not.toContain(token);
    expect(out).not.toContain(dbUrl);
    expect(out).toContain("postgres://***@db.internal:5432/prod");
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});
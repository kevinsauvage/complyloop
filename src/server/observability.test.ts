import { inspect } from "node:util";

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

type ConsoleMethod = "error" | "warn" | "info" | "debug";

/** Raw text written through a console method during `callback`. */
function captureConsole(method: ConsoleMethod, callback: () => void): string {
  const chunks: string[] = [];
  const spy = vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
    chunks.push(
      args
        .map((value) => (typeof value === "string" ? value : inspect(value)))
        .join(" "),
    );
  });
  callback();
  spy.mockRestore();
  return chunks.join("\n");
}

describe("observability", () => {
  it("emits a readable error line with context", () => {
    const out = captureConsole("error", () =>
      reportError(new Error("workspace missing"), {
        code: "workspace_missing",
        projectId: "p1",
      }),
    );
    expect(out).toContain("[error] workspace missing");
    expect(out).toContain("workspace_missing");
    expect(out).toContain("p1");
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "workspace missing" }),
    );
  });

  it("emits a readable warning line", () => {
    const out = captureConsole("warn", () =>
      reportWarning("token decrypt failed", { code: "token_decrypt" }),
    );
    expect(out).toContain("[warning] token decrypt failed");
    expect(out).toContain("token_decrypt");
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "token decrypt failed",
      "warning",
    );
  });

  it("logs info/debug in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    const info = captureConsole("info", () =>
      reportInfo("assessment started", { code: "assessment_started" }),
    );
    const debug = captureConsole("debug", () =>
      reportDebug("page evaluate", { url: "/" }),
    );
    expect(info).toContain("[info] assessment started");
    expect(debug).toContain("[debug] page evaluate");
  });

  it("silences info/debug in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    reportInfo("should not appear", {});
    reportDebug("should not appear", {});
    expect(info).not.toHaveBeenCalled();
    expect(debug).not.toHaveBeenCalled();
  });

  it("reportAppError forwards digest and code", () => {
    const out = captureConsole("error", () =>
      reportAppError(Object.assign(new Error("boom"), { digest: "d-1" }), "app_error_boundary"),
    );
    expect(out).toContain("app_error_boundary");
    expect(out).toContain("d-1");
    expect(out).toContain("boom");
  });

  it("redacts credentials from logged message and stack before reporting", () => {
    const dbUrl = "postgres://app:hunter2@db.internal:5432/prod";
    const token = "ghp_secret_token_123456";
    const error = new Error(`connect failed for ${dbUrl} token=${token}`);
    error.stack = `Error: connect failed for ${dbUrl} token=${token}\n    at connect`;
    const out = captureConsole("error", () =>
      reportError(error, { code: "db_error" }),
    );

    expect(out).not.toContain("hunter2");
    expect(out).not.toContain(token);
    expect(out).not.toContain(dbUrl);
    expect(out).toContain("postgres://***@db.internal:5432/prod");
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});

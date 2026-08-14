import * as Sentry from "@sentry/nextjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reportError, reportWarning } from "./observability";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("observability", () => {
  it("emits structured JSON errors to console.error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    reportError(new Error("workspace missing"), {
      code: "workspace_missing",
      projectId: "p1",
    });
    expect(spy).toHaveBeenCalledOnce();
    const payload = JSON.parse(String(spy.mock.calls[0]?.[0])) as {
      severity: string;
      message: string;
      code: string;
      projectId: string;
    };
    expect(payload.severity).toBe("error");
    expect(payload.message).toBe("workspace missing");
    expect(payload.code).toBe("workspace_missing");
    expect(payload.projectId).toBe("p1");
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "workspace missing" }),
    );
  });

  it("emits structured warnings to console.warn", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    reportWarning("token decrypt failed", { code: "token_decrypt" });
    expect(spy).toHaveBeenCalledOnce();
    const payload = JSON.parse(String(spy.mock.calls[0]?.[0])) as {
      severity: string;
      message: string;
    };
    expect(payload.severity).toBe("warning");
    expect(payload.message).toBe("token decrypt failed");
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "token decrypt failed",
      "warning",
    );
  });
});

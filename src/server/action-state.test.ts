import { afterEach, describe, expect, it, vi } from "vitest";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";

import {
  initialActionState,
  publicErrorMessage,
  runAction,
  unexpectedActionMessage,
} from "./action-state";
import { RateLimitError } from "./rate-limit";

afterEach(() => {
  vi.restoreAllMocks();
});

const ERROR_REF_UUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const ERROR_REF = "aaaaaaaabbbb";

function stubErrorRef(): void {
  vi.spyOn(crypto, "randomUUID").mockReturnValue(ERROR_REF_UUID);
}

describe("runAction", () => {
  it("returns a success message from the runner", async () => {
    await expect(runAction(async () => "Saved.")).resolves.toEqual({
      ok: true,
      message: "Saved.",
    });
  });

  it("defaults the success message when the runner returns void", async () => {
    await expect(runAction(async () => undefined)).resolves.toEqual({
      ok: true,
      message: "Done.",
    });
  });

  it("keeps PublicError messages without reporting them", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      runAction(async () => {
        throw new PublicError(
          "Not allowed: missing permission project.connect.",
        );
      }),
    ).resolves.toEqual({
      ok: false,
      message: "Not allowed: missing permission project.connect.",
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("sanitizes unexpected throwables with a reference", async () => {
    stubErrorRef();
    vi.spyOn(process.stderr, "write");
    await expect(
      runAction(async () => {
        throw "unexpected";
      }),
    ).resolves.toEqual({
      ok: false,
      message: unexpectedActionMessage(ERROR_REF),
    });
  });

  it("exposes a stable initial state", () => {
    expect(initialActionState).toEqual({ ok: false, message: null });
  });
});

describe("publicErrorMessage", () => {
  it("maps RateLimitError and connect PublicError as public copy", () => {
    expect(publicErrorMessage(new RateLimitError())).toBe(
      "Too many requests. Try again shortly.",
    );
    expect(publicErrorMessage(new PublicError("Bad path.", "connect"))).toBe(
      "Bad path.",
    );
  });

  it("sanitizes unexpected Error messages and reports them", () => {
    stubErrorRef();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(publicErrorMessage(new Error("ENOENT /tmp/clone"))).toBe(
      unexpectedActionMessage(ERROR_REF),
    );
    expect(spy).toHaveBeenCalled();
  });
});

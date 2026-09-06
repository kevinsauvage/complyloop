import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicError } from "@complyloop/db/types";
import {
  actionErrorState,
  emptyActionMessageState,
  formError,
  formSuccess,
  publicErrorMessage,
  runActionMessage,
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

describe("formError / formSuccess", () => {
  it("builds toastable form states", () => {
    expect(formError("Nope.")).toEqual({ error: "Nope.", message: null });
    expect(formSuccess("Saved.")).toEqual({ error: null, message: "Saved." });
    expect(emptyActionMessageState).toEqual({ error: null, message: null });
  });
});

describe("runActionMessage", () => {
  it("returns a success message from the runner", async () => {
    await expect(runActionMessage(async () => "Saved.")).resolves.toEqual({
      error: null,
      message: "Saved.",
    });
  });

  it("defaults the success message when the runner returns void", async () => {
    await expect(runActionMessage(async () => undefined)).resolves.toEqual({
      error: null,
      message: "Done.",
    });
  });

  it("keeps PublicError messages without reporting them", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      runActionMessage(async () => {
        throw new PublicError(
          "Not allowed: missing permission project.connect.",
        );
      }),
    ).resolves.toEqual({
      error: "Not allowed: missing permission project.connect.",
      message: null,
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("sanitizes unexpected throwables with a reference", async () => {
    stubErrorRef();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      runActionMessage(async () => {
        throw "unexpected";
      }),
    ).resolves.toEqual({
      error: unexpectedActionMessage(ERROR_REF),
      message: null,
    });
  });
});

describe("actionErrorState / publicErrorMessage", () => {
  it("maps PublicError instances to form-state errors without reporting", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(actionErrorState(new PublicError("Not allowed."))).toEqual({
      error: "Not allowed.",
      message: null,
    });
    expect(spy).not.toHaveBeenCalled();
  });

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
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(actionErrorState(new Error("ENOENT /tmp/clone"))).toEqual({
      error: unexpectedActionMessage(ERROR_REF),
      message: null,
    });
    expect(spy).toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicError } from "@/core/public-error";
import {
  actionErrorState,
  connectFormError,
  emptyActionMessageState,
  formError,
  formSuccess,
  publicErrorMessage,
  readFormString,
  requireFormString,
  runActionMessage,
  unexpectedActionMessage,
} from "./action-state";
import { ConnectError } from "./connect-error";
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

  it("maps RateLimitError and ConnectError as public copy", () => {
    expect(publicErrorMessage(new RateLimitError())).toBe(
      "Too many requests. Try again shortly.",
    );
    expect(publicErrorMessage(new ConnectError("Bad path."))).toBe("Bad path.");
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

describe("connectFormError", () => {
  it("maps ConnectError to a form error state", () => {
    expect(connectFormError(new ConnectError("Bad path."))).toEqual({
      error: "Bad path.",
      message: null,
    });
  });

  it("sanitizes unexpected errors instead of rethrowing", () => {
    stubErrorRef();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(connectFormError(new Error("boom"))).toEqual({
      error: unexpectedActionMessage(ERROR_REF),
      message: null,
    });
  });
});

describe("readFormString / requireFormString", () => {
  it("reads non-empty string fields", () => {
    const formData = new FormData();
    formData.set("orgId", "org-1");
    expect(readFormString(formData, "orgId")).toBe("org-1");
    expect(requireFormString(formData, "orgId", "required")).toBe("org-1");
  });

  it("treats missing and empty values as absent", () => {
    const formData = new FormData();
    formData.set("orgId", "");
    expect(readFormString(formData, "orgId")).toBeNull();
    expect(readFormString(formData, "missing")).toBeNull();
    expect(() =>
      requireFormString(formData, "orgId", "Organization id is required."),
    ).toThrow("Organization id is required.");
  });
});

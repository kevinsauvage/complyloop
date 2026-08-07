import { afterEach, describe, expect, it, vi } from "vitest";
import {
  actionErrorState,
  connectFormError,
  emptyActionMessageState,
  runActionMessage,
} from "./action-state";
import { ConnectError } from "./connect-url";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("actionErrorState", () => {
  it("returns a success message from runActionMessage", async () => {
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

  it("maps Error instances to form-state errors and reports them", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(actionErrorState(new Error("Not allowed."))).toEqual({
      error: "Not allowed.",
      message: null,
    });
    expect(spy).toHaveBeenCalled();
  });

  it("falls back for unknown throwables", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(actionErrorState("boom")).toEqual({
      error: "Something went wrong.",
      message: null,
    });
  });

  it("exposes an empty initial state", () => {
    expect(emptyActionMessageState).toEqual({ error: null, message: null });
  });
});

describe("connectFormError", () => {
  it("maps ConnectError to a form error state", () => {
    expect(connectFormError(new ConnectError("Bad path."))).toEqual({
      error: "Bad path.",
    });
  });

  it("rethrows unexpected errors", () => {
    expect(() => connectFormError(new Error("boom"))).toThrow("boom");
  });
});

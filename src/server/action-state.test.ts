import { afterEach, describe, expect, it, vi } from "vitest";
import {
  actionErrorState,
  emptyActionMessageState,
  runActionMessage,
} from "./action-state";

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

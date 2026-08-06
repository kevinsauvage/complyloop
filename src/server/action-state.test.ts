import { describe, expect, it } from "vitest";
import { actionErrorState, emptyActionMessageState } from "./action-state";

describe("actionErrorState", () => {
  it("maps Error instances to form-state errors", () => {
    expect(actionErrorState(new Error("Not allowed."))).toEqual({
      error: "Not allowed.",
      message: null,
    });
  });

  it("falls back for unknown throwables", () => {
    expect(actionErrorState("boom")).toEqual({
      error: "Something went wrong.",
      message: null,
    });
  });

  it("exposes an empty initial state", () => {
    expect(emptyActionMessageState).toEqual({ error: null, message: null });
  });
});

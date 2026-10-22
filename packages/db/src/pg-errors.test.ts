import { describe, expect, it } from "vitest";

import { hasPgCode, isUniqueViolation } from "./pg-errors.ts";

describe("pg error helpers", () => {
  it("reads the code from a raw postgres.js error", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("walks drizzle's cause chain", () => {
    const wrapped = new Error("query failed", {
      cause: new Error("duplicate key", { cause: { code: "23505" } }),
    });
    expect(isUniqueViolation(wrapped)).toBe(true);
  });

  it("does not confuse other SQLSTATE codes", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(hasPgCode({ cause: { code: "23503" } }, "23503")).toBe(true);
  });

  it("is safe on primitives and cause cycles", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
    const cyclic: { cause?: unknown } = {};
    cyclic.cause = cyclic;
    expect(isUniqueViolation(cyclic)).toBe(false);
  });
});

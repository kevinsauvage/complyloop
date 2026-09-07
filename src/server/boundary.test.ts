import { describe, expect, it } from "vitest";
import { z } from "zod";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { entityIdSchema } from "@/core/boundary";
import { parseForm, parseInput } from "./boundary";

describe("parseForm", () => {
  it("parses matching form fields", () => {
    const form = new FormData();
    form.set("orgId", " org-1 ");
    expect(parseForm(z.object({ orgId: entityIdSchema }), form)).toEqual({
      orgId: "org-1",
    });
  });

  it("throws PublicError with the first issue message", () => {
    const form = new FormData();
    const schema = z.object({
      orgId: z
        .string({ error: "An organization id is required." })
        .trim()
        .min(1, { error: "An organization id is required." }),
    });
    expect(() => parseForm(schema, form)).toThrow(PublicError);
    expect(() => parseForm(schema, form)).toThrow(
      "An organization id is required.",
    );
  });
});

describe("parseInput", () => {
  it("parses a bound action argument", () => {
    expect(parseInput(entityIdSchema, "f1")).toBe("f1");
  });

  it("rejects an empty bound id", () => {
    expect(() => parseInput(entityIdSchema, "  ")).toThrow(PublicError);
  });
});

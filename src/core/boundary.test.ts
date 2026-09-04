import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  assessmentJobsResponseSchema,
  entityIdSchema,
  findingIdsField,
  firstIssueMessage,
  formRecord,
  githubRepoSearchResponseSchema,
  optionalNoteSchema,
  parseUnknown,
  requiredField,
} from "./boundary";

describe("formRecord", () => {
  it("maps single fields to strings and repeated fields to arrays", () => {
    const form = new FormData();
    form.set("orgId", "org-1");
    form.append("findingIds", "f1");
    form.append("findingIds", "f2");
    expect(formRecord(form)).toEqual({
      orgId: "org-1",
      findingIds: ["f1", "f2"],
    });
  });
});

describe("parseUnknown", () => {
  it("returns parsed data when the payload matches", () => {
    expect(parseUnknown(entityIdSchema, "  org-1  ", "Invalid id.")).toBe("org-1");
  });

  it("throws the fallback message when the payload does not match", () => {
    expect(() => parseUnknown(entityIdSchema, "", "Invalid id.")).toThrow(
      "Invalid id.",
    );
  });
});

describe("firstIssueMessage", () => {
  it("uses the first Zod issue message", () => {
    const result = z
      .object({
        orgId: z
          .string({ error: "An organization id is required." })
          .trim()
          .min(1, { error: "An organization id is required." }),
      })
      .safeParse({});
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(firstIssueMessage(result.error, "Invalid form input.")).toBe(
      "An organization id is required.",
    );
  });
});

describe("note and finding-id field schemas", () => {
  it("trims optional notes and rejects notes over 2000 characters", () => {
    expect(optionalNoteSchema.parse("  hello  ")).toBe("hello");
    expect(optionalNoteSchema.parse("")).toBeUndefined();
    expect(optionalNoteSchema.parse(undefined)).toBeUndefined();
    expect(optionalNoteSchema.safeParse("x".repeat(2001)).success).toBe(false);
  });

  it("requires a non-empty field via requiredField", () => {
    const note = requiredField("Note required.", 2000);
    expect(note.parse("  note  ")).toBe("note");
    expect(note.safeParse("  ").success).toBe(false);
  });

  it("normalizes one or many finding ids and rejects an empty list", () => {
    const findingIds = findingIdsField("Select at least one finding.");
    expect(findingIds.parse("f1")).toEqual(["f1"]);
    expect(findingIds.parse([" f1 ", "f1", "f2"])).toEqual(["f1", "f2"]);
    expect(findingIds.safeParse([]).success).toBe(false);
  });
});

describe("githubRepoSearchResponseSchema", () => {
  it("accepts a search page and rejects a forged payload", () => {
    const ok = {
      repos: [
        {
          fullName: "acme/app",
          name: "app",
          description: null,
          private: false,
          defaultBranch: "main",
          updatedAt: "2026-01-01T00:00:00.000Z",
          htmlUrl: "https://github.com/acme/app",
          cloneUrl: "https://github.com/acme/app.git",
        },
      ],
      page: 1,
      hasMore: false,
    };
    expect(githubRepoSearchResponseSchema.parse(ok).repos[0]?.fullName).toBe(
      "acme/app",
    );
    expect(
      githubRepoSearchResponseSchema.safeParse({ error: "nope" }).success,
    ).toBe(false);
  });
});

describe("assessmentJobsResponseSchema", () => {
  it("accepts a job list and rejects a missing jobs array", () => {
    const ok = {
      jobs: [
        {
          id: "job-1",
          projectId: "p1",
          status: "queued",
          trigger: "manual",
          payload: {},
          attempts: 0,
          maxAttempts: 3,
          availableAt: "2026-01-01T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    expect(assessmentJobsResponseSchema.parse(ok).jobs).toHaveLength(1);
    expect(assessmentJobsResponseSchema.safeParse({ jobs: null }).success).toBe(
      false,
    );
  });
});

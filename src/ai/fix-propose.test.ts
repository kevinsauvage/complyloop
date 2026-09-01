import { describe, expect, it, vi } from "vitest";
import { generateObject } from "ai";
import type { Control } from "@/core/project-types";
import type { Finding } from "@/core/finding-types";
import { proposeFixEdits } from "./fix-propose";

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

const generate = vi.mocked(generateObject);

const finding = {
  id: "f1",
  reason: "Missing alt",
  location: {
    kind: "source",
    filePath: "Hero.tsx",
    line: 1,
    column: 1,
    snippet: "<img />",
    span: { start: 0, end: 1 },
  },
  checkId: "img-alt",
} as Finding;

const control = {
  code: "WCAG 1.1.1",
  secondaryCode: "RGAA 1.1",
  title: "Images",
} as Control;

describe("proposeFixEdits", () => {
  it("returns one typed patch for the Finding source file", async () => {
    generate.mockResolvedValue({
      object: {
        description: "Add alt",
        edits: [
          {
            path: "Hero.tsx",
            oldText: "<img />",
            newText: '<img alt="Hero" />',
          },
        ],
      },
    } as never);

    const result = await proposeFixEdits({
      finding,
      control,
      fileContents: { "Hero.tsx": "<img />\n" },
    });

    expect(result).toEqual({
      description: "Add alt",
      provenance: "ai",
      model: "minimax/minimax-m3",
      edits: [
        {
          path: "Hero.tsx",
          oldText: "<img />",
          newText: '<img alt="Hero" />',
        },
      ],
    });
    expect(result.edits[0]?.newText).toContain("alt=");
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "minimax/minimax-m3",
        prompt: expect.stringContaining("Change only the Finding source file"),
      }),
    );
  });

  it("rejects empty and cross-file model edits", async () => {
    generate
      .mockResolvedValueOnce({
        object: { description: "Nothing", edits: [] },
      } as never)
      .mockResolvedValueOnce({
        object: {
          description: "Wrong file",
          edits: [{ path: "Other.tsx", oldText: "a", newText: "b" }],
        },
      } as never);

    const input = {
      finding,
      control,
      fileContents: { "Hero.tsx": "<img />\n" },
    };
    await expect(proposeFixEdits(input)).rejects.toThrow(/at least one edit/);
    await expect(proposeFixEdits(input)).rejects.toThrow(/target Hero\.tsx/);
  });
});

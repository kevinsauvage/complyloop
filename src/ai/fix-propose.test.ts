import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateObject } from "ai";
import type { Control } from "@/core/project-types";
import type { Finding } from "@/core/finding-types";
import { proposeFixEdits } from "./fix-propose";

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

const generate = vi.mocked(generateObject);

beforeEach(() => {
  generate.mockReset();
});

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

  it("throws when the finding is not a source finding", async () => {
    const domFinding: Finding = {
      ...finding,
      location: {
        kind: "dom",
        url: "https://app.example/page",
        selector: "#submit",
        snippet: "<button id=\"submit\" />",
      },
    };
    await expect(
      proposeFixEdits({
        finding: domFinding,
        control,
        fileContents: { "Hero.tsx": "<img />\n" },
      }),
    ).rejects.toThrow(/requires a source Finding/);
    expect(generate).not.toHaveBeenCalled();
  });

  it("truncates oversized file contents before prompting", async () => {
    generate.mockResolvedValue({
      object: {
        description: "Add alt",
        edits: [{ path: "Hero.tsx", oldText: "<img />", newText: "<img alt=\"x\"/>" }],
      },
    } as never);
    // Build a content string larger than MAX_FILE_CHARS (80,000).
    const huge = `<img />\n` + "x".repeat(90_000);

    await proposeFixEdits({
      finding,
      control,
      fileContents: { "Hero.tsx": huge },
    });

    const call = generate.mock.calls[0]?.[0] as { prompt: string };
    expect(call.prompt).toContain("/* …truncated… */");
    expect(call.prompt.length).toBeLessThan(90_000 + 2_000);
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

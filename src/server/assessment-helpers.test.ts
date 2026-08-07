import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProposedFix, SourceLocation } from "@/core/finding-types";
import {
  buildSuggestion,
  mergeFix,
  sameInstance,
} from "./assessment-helpers";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function sourceLoc(
  partial: Omit<SourceLocation, "kind" | "column" | "span"> &
    Partial<Pick<SourceLocation, "column" | "span">>,
): SourceLocation {
  return {
    kind: "source",
    column: partial.column ?? 1,
    span: partial.span ?? { start: 0, end: 1 },
    filePath: partial.filePath,
    line: partial.line,
    snippet: partial.snippet,
  };
}

describe("sameInstance", () => {
  it("matches by snippet when lines differ", () => {
    expect(
      sameInstance(
        { location: sourceLoc({ filePath: "App.tsx", line: 10, snippet: '<img src="x" />' }) },
        { location: sourceLoc({ filePath: "App.tsx", line: 99, snippet: '<img src="x" />' }) },
      ),
    ).toBe(true);
  });

  it("matches by line when snippets differ", () => {
    expect(
      sameInstance(
        { location: sourceLoc({ filePath: "App.tsx", line: 4, snippet: "old" }) },
        { location: sourceLoc({ filePath: "App.tsx", line: 4, snippet: "new" }) },
      ),
    ).toBe(true);
  });

  it("rejects different files", () => {
    expect(
      sameInstance(
        { location: sourceLoc({ filePath: "A.tsx", line: 1, snippet: "x" }) },
        { location: sourceLoc({ filePath: "B.tsx", line: 1, snippet: "x" }) },
      ),
    ).toBe(false);
  });

  it("matches DOM findings by url and selector", () => {
    expect(
      sameInstance(
        {
          location: {
            kind: "dom",
            url: "https://x.test/",
            selector: "#email",
            snippet: "<input>",
          },
        },
        {
          location: {
            kind: "dom",
            url: "https://x.test/",
            selector: "#email",
            snippet: "<input id=email>",
          },
        },
      ),
    ).toBe(true);
  });
});

describe("mergeFix", () => {
  const fresh: ProposedFix = {
    kind: "insert_attribute",
    attribute: "alt",
    value: "scanned",
    editable: true,
    span: { start: 1, end: 2 },
  };

  it("preserves an editable human-edited attribute value", () => {
    const existing: ProposedFix = {
      kind: "insert_attribute",
      attribute: "alt",
      value: "human",
      editable: true,
      span: { start: 0, end: 1 },
    };
    expect(mergeFix(existing, fresh)).toEqual({ ...fresh, value: "human" });
  });

  it("returns the fresh fix when the existing value is not editable", () => {
    const existing: ProposedFix = {
      kind: "insert_attribute",
      attribute: "alt",
      value: "human",
      editable: false,
      span: { start: 0, end: 1 },
    };
    expect(mergeFix(existing, fresh)).toEqual(fresh);
  });

  it("returns the fresh fix when either side is null", () => {
    expect(mergeFix(null, fresh)).toEqual(fresh);
    expect(mergeFix(fresh, null)).toBeNull();
  });
});

describe("buildSuggestion", () => {
  it("returns null when there is no fix", () => {
    expect(
      buildSuggestion("/tmp", {
        location: sourceLoc({ filePath: "App.tsx", line: 1, snippet: "x" }),
        fix: null,
      }),
    ).toBeNull();
  });

  it("builds a deterministic suggestion from the current file text", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "suggest-"));
    tempDirs.push(root);
    const filePath = "App.tsx";
    fs.writeFileSync(
      path.join(root, filePath),
      '<img src="/x.png" />\n',
      "utf8",
    );

    const suggestion = buildSuggestion(root, {
      location: sourceLoc({
        filePath,
        line: 1,
        snippet: '<img src="/x.png" />',
        span: { start: 0, end: 20 },
      }),
      fix: {
        kind: "insert_attribute",
        attribute: "alt",
        value: "",
        editable: true,
        span: { start: 4, end: 4 },
      },
    });

    expect(suggestion).not.toBeNull();
    expect(suggestion?.provenance).toBe("deterministic");
    expect(suggestion?.confidence).toBe("high");
    expect(suggestion?.description.length).toBeGreaterThan(0);
    expect(suggestion?.proposedSnippet).toContain("alt");
  });
});

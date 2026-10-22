import { describe, expect, it } from "vitest";

import { boundFileEdit } from "./patch-types";

describe("boundFileEdit", () => {
  const original = [
    "import React from 'react';",
    "",
    "export function Hero() {",
    "  return (",
    "    <section>",
    '      <img src="hero.png" />',
    "    </section>",
    "  );",
    "}",
  ].join("\n");
  const updated = original.replace(
    '<img src="hero.png" />',
    '<img src="hero.png" alt="Hero" />',
  );

  it("keeps only a small window around the change", () => {
    const edit = boundFileEdit("Hero.tsx", original, updated);
    expect(edit.oldText).toContain('<img src="hero.png" />');
    expect(edit.oldText.length).toBeLessThan(original.length);
    expect(edit.oldText).not.toContain("import React");
  });

  it("produces an edit that reproduces the updated file exactly once", () => {
    const edit = boundFileEdit("Hero.tsx", original, updated);
    expect(original.split(edit.oldText)).toHaveLength(2);
    expect(original.replace(edit.oldText, () => edit.newText)).toBe(updated);
  });

  it("expands until the window is unique, falling back to the whole file", () => {
    const repeated = "a\nb\nc\na\nb\nc\na\nb\nc";
    const changed = repeated.replace(/\nb\n/, "\nB\n");
    const edit = boundFileEdit("repeat.txt", repeated, changed);
    // oldText must still match exactly once for apply to be sound.
    expect(repeated.split(edit.oldText)).toHaveLength(2);
    expect(repeated.replace(edit.oldText, () => edit.newText)).toBe(changed);
  });
});

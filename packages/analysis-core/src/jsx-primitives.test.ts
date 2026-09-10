import { describe, expect, it } from "vitest";
import { parseSource } from "./parse";
import { isPropSpreadingHost } from "./jsx-primitives";
import { visitJsxTags } from "./parse";
import { buttonNameCheck } from "./checks/families/names";

describe("prop-spreading primitives", () => {
  it("detects JSX spread attributes", () => {
    const parsed = parseSource(
      "input.tsx",
      `export const Input = (properties) => <input className="x" {...properties} />;`,
    );
    const nodes: boolean[] = [];
    visitJsxTags(parsed.sourceFile, (node) => {
      nodes.push(isPropSpreadingHost(node));
    });
    expect(nodes).toEqual([true]);
  });

  it("does not flag a spreading button host", () => {
    expect(
      buttonNameCheck.run(
        parseSource("button.tsx", `export const B = (p) => <button {...p} />;`),
      ),
    ).toEqual([]);
  });
});

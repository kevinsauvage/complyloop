import { describe, expect, it } from "vitest";
import { inputLabelCheck } from "./checks/input-label";
import { buttonNameCheck } from "./checks/button-name";
import { imgAltCheck } from "./checks/img-alt";
import { parseSource } from "./parse";
import { isPropSpreadingHost } from "./jsx-primitives";
import { visitJsxTags } from "./parse";

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

  it("does not flag design-system Input that only spreads props", () => {
    const source = `
      export const Input = (properties: React.InputHTMLAttributes<HTMLInputElement>) => (
        <input className="field" {...properties} />
      );
    `;
    expect(inputLabelCheck.run(parseSource("ui/primitives/input.tsx", source))).toEqual(
      [],
    );
  });

  it("still flags a concrete unlabeled input without spread", () => {
    const source = `export const Form = () => <input type="email" />;`;
    const findings = inputLabelCheck.run(parseSource("form.tsx", source));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.checkId).toBe("input-label");
  });

  it("does not flag spreading button/img hosts", () => {
    expect(
      buttonNameCheck.run(
        parseSource("button.tsx", `export const B = (p) => <button {...p} />;`),
      ),
    ).toEqual([]);
    expect(
      imgAltCheck.run(
        parseSource("img.tsx", `export const I = (p) => <img {...p} />;`),
      ),
    ).toEqual([]);
  });
});

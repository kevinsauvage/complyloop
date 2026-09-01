import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { inputLabelCheck } from "./input-label";

describe("input-label", () => {
  it("flags an input with no label association", () => {
    const findings = inputLabelCheck.run(
      parseSource("test.tsx", `const A = () => <input type="email" name="work-email" />;`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].fix).toMatchObject({ attribute: "aria-label", value: "Work email" });
  });

  it("accepts aria-label, same-file <label htmlFor>, and exempt types", () => {
    const source = `const A = () => (<form>
      <input type="search" aria-label="Search products" />
      <label htmlFor="email">Email</label>
      <input id="email" type="email" />
      <input type="hidden" name="token" />
      <input type="submit" />
    </form>);`;
    expect(inputLabelCheck.run(parseSource("test.tsx", source))).toHaveLength(0);
  });

  it("flags unlabeled select and textarea", () => {
    expect(
      inputLabelCheck.run(
        parseSource("test.tsx", `const A = () => <select name="country" />;`),
      ),
    ).toHaveLength(1);
    expect(
      inputLabelCheck.run(
        parseSource("test.tsx", `const A = () => <textarea name="bio" />;`),
      ),
    ).toHaveLength(1);
  });
});

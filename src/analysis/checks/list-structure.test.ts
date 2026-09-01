import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { listStructureCheck } from "./list-structure";

describe("list-structure", () => {
  it("flags orphan list items and non-li list children", () => {
    const orphan = listStructureCheck.run(
      parseSource("test.tsx", `const A = () => <div><li>x</li></div>;`),
    );
    expect(orphan).toHaveLength(1);
    expect(orphan[0]?.reason).toContain("found under <div>");
    expect(orphan[0]?.confidence).toBe("high");

    expect(
      listStructureCheck.run(
        parseSource("test.tsx", `const A = () => <ul><div>not an item</div></ul>;`),
      ),
    ).toHaveLength(1);
  });

  it("flags list items with no enclosing JSX parent", () => {
    const findings = listStructureCheck.run(
      parseSource("test.tsx", `const item = <li>x</li>;`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.confidence).toBe("medium");
    expect(findings[0]?.reason).toContain("no list parent");
  });

  it("flags self-closing non-li children inside lists", () => {
    const findings = listStructureCheck.run(
      parseSource("test.tsx", `const A = () => <ol><img src="/x.png" alt="" /></ol>;`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.reason).toContain("<img>");
  });

  it("accepts well-formed lists including menu", () => {
    expect(
      listStructureCheck.run(
        parseSource("test.tsx", `const A = () => <ul><li>One</li><li>Two</li></ul>;`),
      ),
    ).toHaveLength(0);
    expect(
      listStructureCheck.run(
        parseSource("test.tsx", `const A = () => <menu><li>A</li></menu>;`),
      ),
    ).toHaveLength(0);
  });

  it("ignores whitespace and expression children that are not elements", () => {
    expect(
      listStructureCheck.run(
        parseSource("test.tsx", `const A = () => <ul>{items}<li>One</li></ul>;`),
      ),
    ).toHaveLength(0);
  });
});

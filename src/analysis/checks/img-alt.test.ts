import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { imgAltCheck } from "./img-alt";

describe("img-alt", () => {
  it("flags an <img> without alt as a violation with an editable fix", () => {
    const findings = imgAltCheck.run(
      parseSource("test.tsx", `const A = () => <img src="/hero-banner.png" />;`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("violation");
    expect(findings[0].fix).toMatchObject({
      kind: "insert_attribute",
      attribute: "alt",
      value: "Hero banner",
      editable: true,
    });
  });

  it("flags generic alt text as a warning without a fix", () => {
    const findings = imgAltCheck.run(
      parseSource("test.tsx", `const A = () => <img src="/x.png" alt="image" />;`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("warning");
    expect(findings[0].fix).toBeNull();
  });

  it("accepts descriptive alt text and empty (decorative) alt", () => {
    const source = `const A = () => (<div><img src="/x.png" alt="Team photo at the 2026 offsite" /><img src="/border.png" alt="" /></div>);`;
    expect(imgAltCheck.run(parseSource("test.tsx", source))).toHaveLength(0);
  });
});

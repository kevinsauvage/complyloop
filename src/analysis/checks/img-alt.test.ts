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

  it("requires alt on area and input type=image", () => {
    const findings = imgAltCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => (<><area href="/zones/1" /><input type="image" src="/buy.png" /></>);`,
      ),
    );

    expect(findings).toHaveLength(2);
    expect(findings.map((finding) => finding.kind)).toEqual([
      "violation",
      "violation",
    ]);
  });

  it("requires an aria name on non-img role=img hosts", () => {
    const findings = imgAltCheck.run(
      parseSource("test.tsx", `const A = () => <div role="img" />;`),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("violation");
    expect(findings[0]?.reason).toMatch(/role="img"/);
  });

  it("requires title or aria name on image/* object and embed", () => {
    const findings = imgAltCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => (<><object type="image/svg+xml" data="/chart.svg" /><embed type="image/png" src="/map.png" /></>);`,
      ),
    );

    expect(findings).toHaveLength(2);
    expect(findings.every((finding) => finding.kind === "violation")).toBe(true);
  });

  it("requires a fallback name or content on informative canvas", () => {
    expect(
      imgAltCheck.run(parseSource("test.tsx", `const A = () => <canvas />;`)),
    ).toHaveLength(1);
    expect(
      imgAltCheck.run(
        parseSource("test.tsx", `const A = () => <canvas aria-label="Sales chart" />;`),
      ),
    ).toHaveLength(0);
    expect(
      imgAltCheck.run(
        parseSource("test.tsx", `const A = () => <canvas>Text fallback</canvas>;`),
      ),
    ).toHaveLength(0);
  });

  it("always flags server-side image maps", () => {
    const findings = imgAltCheck.run(
      parseSource("test.tsx", `const A = () => <img isMap alt="Campus map" src="/map.png" />;`),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("violation");
    expect(findings[0]?.reason).toMatch(/image map/i);
  });
});

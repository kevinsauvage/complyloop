import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { anchorNameCheck } from "./anchor-name";

describe("anchor-name", () => {
  it("flags an icon-only link with href", () => {
    const findings = anchorNameCheck.run(
      parseSource("test.tsx", `const A = () => <a href="/cart"><svg /></a>;`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.fix).toMatchObject({
      kind: "insert_attribute",
      attribute: "aria-label",
    });
  });

  it("flags Next.js Link without an accessible name", () => {
    expect(
      anchorNameCheck.run(
        parseSource("test.tsx", `const A = () => <Link href="/cart"><svg /></Link>;`),
      ),
    ).toHaveLength(1);
  });

  it("skips anchors without href, prop-spreading hosts, and named links", () => {
    expect(
      anchorNameCheck.run(parseSource("test.tsx", `const A = () => <a><svg /></a>;`)),
    ).toHaveLength(0);
    expect(
      anchorNameCheck.run(
        parseSource("test.tsx", `const A = ({...p}) => <a href="/x" {...p}><svg /></a>;`),
      ),
    ).toHaveLength(0);
    expect(
      anchorNameCheck.run(
        parseSource("test.tsx", `const A = () => <a href="/x" aria-label="Cart"><svg /></a>;`),
      ),
    ).toHaveLength(0);
  });

  it("accepts links named by text or an image alt", () => {
    const source = `const A = () => (<div>
      <a href="/">Home</a>
      <a href="/x"><img src="/logo.png" alt="Acme home" /></a>
    </div>);`;
    expect(anchorNameCheck.run(parseSource("test.tsx", source))).toHaveLength(0);
  });
});

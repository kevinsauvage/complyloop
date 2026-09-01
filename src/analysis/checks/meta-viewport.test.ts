import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { metaViewportCheck } from "./meta-viewport";

describe("meta-viewport", () => {
  it("flags viewport that disables zoom", () => {
    const findings = metaViewportCheck.run(
      parseSource(
        "test.tsx",
        `const H = () => <meta name="viewport" content="width=device-width, user-scalable=no" />;`,
      ),
    );
    expect(findings).toHaveLength(1);
  });

  it("flags user-scalable=0 and user-scalable=false", () => {
    expect(
      metaViewportCheck.run(
        parseSource("test.tsx", `const H = () => <meta name="viewport" content="user-scalable=0" />;`),
      ),
    ).toHaveLength(1);
    expect(
      metaViewportCheck.run(
        parseSource(
          "test.tsx",
          `const H = () => <meta name="viewport" content="user-scalable=false" />;`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("flags maximum-scale below 2", () => {
    expect(
      metaViewportCheck.run(
        parseSource("test.tsx", `const H = () => <meta name="viewport" content="maximum-scale=1" />;`),
      ),
    ).toHaveLength(1);
    expect(
      metaViewportCheck.run(
        parseSource(
          "test.tsx",
          `const H = () => <meta name="viewport" content="maximum-scale=1.5" />;`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("accepts a zoomable viewport and maximum-scale >= 2", () => {
    expect(
      metaViewportCheck.run(
        parseSource(
          "test.tsx",
          `const H = () => <meta name="viewport" content="width=device-width, initial-scale=1" />;`,
        ),
      ),
    ).toHaveLength(0);
    expect(
      metaViewportCheck.run(
        parseSource("test.tsx", `const H = () => <meta name="viewport" content="maximum-scale=2" />;`),
      ),
    ).toHaveLength(0);
  });

  it("ignores non-viewport meta, missing content, and dynamic content", () => {
    expect(
      metaViewportCheck.run(
        parseSource("test.tsx", `const H = () => <meta name="description" content="x" />;`),
      ),
    ).toHaveLength(0);
    expect(
      metaViewportCheck.run(parseSource("test.tsx", `const H = () => <meta name="viewport" />;`)),
    ).toHaveLength(0);
    expect(
      metaViewportCheck.run(
        parseSource("test.tsx", `const H = () => <meta name="viewport" content={content} />;`),
      ),
    ).toHaveLength(0);
  });
});

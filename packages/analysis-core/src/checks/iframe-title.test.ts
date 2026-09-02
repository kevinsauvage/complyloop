import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { iframeTitleCheck } from "./iframe-title";

describe("iframe-title", () => {
  it("flags iframe without title and suggests a fix", () => {
    const findings = iframeTitleCheck.run(
      parseSource("test.tsx", `const A = () => <iframe src="https://example.com" />;`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].fix).toMatchObject({ attribute: "title" });
  });
});

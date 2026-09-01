import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { officeDocsAltPresentCheck } from "./office-docs-alt-present";

describe("office-docs-alt-present", () => {
  it("warns on office document link without adjacent alternative", () => {
    const findings = officeDocsAltPresentCheck.run(
      parseSource("test.tsx", `const A = () => <a href="/guide.pdf">Guide</a>;`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("warning");
  });

  it("accepts office link with adjacent html alternative", () => {
    expect(
      officeDocsAltPresentCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <>
              <a href="/guide.pdf">Guide (PDF)</a>
              <a href="/guide.html">HTML version</a>
            </>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});

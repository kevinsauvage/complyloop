import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { decorativeIgnoredCheck } from "./decorative-ignored";

describe("decorative-ignored", () => {
  it("flags presentation role with non-empty alt", () => {
    const findings = decorativeIgnoredCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => <img src="/border.png" alt="divider" role="presentation" />;`,
      ),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.checkId).toBe("decorative-ignored");
  });

  it("flags empty alt with title", () => {
    const findings = decorativeIgnoredCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => <img src="/border.png" alt="" title="Spacer" />;`,
      ),
    );
    expect(findings).toHaveLength(1);
  });

  it("flags whitespace-only alt", () => {
    const findings = decorativeIgnoredCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => <img src="/border.png" alt="   " />;`,
      ),
    );
    expect(findings).toHaveLength(1);
  });

  it("accepts properly ignored decorative images", () => {
    expect(
      decorativeIgnoredCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => (
            <>
              <img src="/border.png" alt="" />
              <img src="/icon.svg" aria-hidden="true" />
              <img src="/line.png" role="presentation" alt="" />
            </>
          );`,
        ),
      ),
    ).toHaveLength(0);
  });
});

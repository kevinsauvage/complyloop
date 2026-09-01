import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { errorSuggestionCheck } from "./error-suggestion";

describe("error-suggestion", () => {
  it("flags an error alert without a suggestion", () => {
    expect(
      errorSuggestionCheck.run(
        parseSource("test.tsx", `const A = () => <div role="alert">Invalid email</div>;`),
      ),
    ).toHaveLength(1);
  });

  it("ignores an error alert that suggests a correction", () => {
    expect(
      errorSuggestionCheck.run(
        parseSource(
          "test.tsx",
          `const A = () => <div role="alert">Invalid email, try name@example.com</div>;`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("ignores non-alert text", () => {
    expect(
      errorSuggestionCheck.run(
        parseSource("test.tsx", `const A = () => <div>Invalid email</div>;`),
      ),
    ).toHaveLength(0);
  });
});

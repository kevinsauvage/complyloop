import { describe, expect, it } from "vitest";

import { type AnalyzerId, engineFromAnalyzer } from "./finding-types";

describe("engineFromAnalyzer", () => {
  it("maps every analyzer id to an engine bucket", () => {
    const runtime: AnalyzerId[] = [
      "axe",
      "html-validate",
      "playwright-custom",
      "site-level",
      "linkinator",
    ];
    const ast: AnalyzerId[] = ["ast", "jsx-a11y"];
    for (const analyzerId of runtime) {
      expect(engineFromAnalyzer(analyzerId)).toBe("runtime");
    }
    for (const analyzerId of ast) {
      expect(engineFromAnalyzer(analyzerId)).toBe("ast");
    }
    expect(engineFromAnalyzer(undefined)).toBe("ast");
  });
});

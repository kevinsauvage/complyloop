import { describe, expect, it } from "vitest";

import {
  type AnalyzerId,
  engineFromAnalyzer,
  isDismissalReason,
} from "./finding-types";

describe("isDismissalReason", () => {
  it("accepts every valid dismissal reason", () => {
    expect(isDismissalReason("false_positive")).toBe(true);
    expect(isDismissalReason("not_applicable")).toBe(true);
    expect(isDismissalReason("accepted_risk")).toBe(true);
  });

  it("rejects unknown strings and non-strings", () => {
    expect(isDismissalReason("banana")).toBe(false);
    expect(isDismissalReason("")).toBe(false);
    expect(isDismissalReason(42)).toBe(false);
    expect(isDismissalReason(null)).toBe(false);
    expect(isDismissalReason(undefined)).toBe(false);
  });
});

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

import { describe, expect, it } from "vitest";

import { findingsFromCustomViolations } from "./custom-checks/index";
import { CUSTOM_PROBE_CHECK_IDS } from "./custom-checks/types";

describe("custom runtime findings", () => {
  it("emits catalog check ids without an axe mapping layer", () => {
    expect(CUSTOM_PROBE_CHECK_IDS).toContain("reflow");
    expect(CUSTOM_PROBE_CHECK_IDS).toContain("dialog-keyboard");
    expect(CUSTOM_PROBE_CHECK_IDS).toContain("form-error-association");
  });

  it("builds findings from custom violations", () => {
    const findings = findingsFromCustomViolations("https://app.example/", [
      {
        id: "reflow",
        impact: "serious",
        description: "Horizontal scroll at 320px",
        help: "Content must reflow",
        nodes: [{ html: "<div>Wide</div>", target: ["div"] }],
      },
    ]);
    expect(findings[0]?.checkId).toBe("reflow");
    expect(findings[0]?.analyzerId).toBe("playwright-custom");
  });

  it("downgrades advisory inference probes to warnings (never fail)", () => {
    const findings = findingsFromCustomViolations("https://app.example/", [
      {
        id: "non-text-contrast",
        impact: "serious",
        description: "Chrome contrast",
        help: "Increase boundary contrast",
        nodes: [{ html: "<a>Link</a>", target: ["a"] }],
      },
    ]);
    expect(findings[0]?.kind).toBe("warning");
    expect(findings[0]?.severity).toBe("moderate");
  });

  it("keeps deterministic probes as violations", () => {
    const findings = findingsFromCustomViolations("https://app.example/", [
      {
        id: "reflow",
        impact: "serious",
        description: "Horizontal scroll at 320px",
        help: "Content must reflow",
        nodes: [{ html: "<div>Wide</div>", target: ["div"] }],
      },
    ]);
    expect(findings[0]?.kind).toBe("violation");
  });
});

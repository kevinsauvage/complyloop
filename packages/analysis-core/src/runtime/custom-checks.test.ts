import { describe, expect, it } from "vitest";
import { findingsFromCustomViolations } from "./custom-checks/index";
import { customProbeCheckIds } from "./custom-checks/types";

describe("custom runtime findings", () => {
  it("emits catalog check ids without an axe mapping layer", () => {
    expect(customProbeCheckIds()).toContain("reflow");
    expect(customProbeCheckIds()).toContain("dialog-keyboard");
    expect(customProbeCheckIds()).toContain("form-error-association");
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
    expect(findings[0]?.engine).toBe("runtime");
    expect(findings[0]?.analyzerId).toBe("playwright-custom");
  });
});

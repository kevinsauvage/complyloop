import { describe, expect, it } from "vitest";
import { checkIdForAxeRule } from "./axe-map";
import {
  findingsFromAxePages,
  joinRuntimeUrl,
  runtimeRoutesFor,
} from "./findings";

describe("axe rule mapping", () => {
  it("maps label and button-name to check ids", () => {
    expect(checkIdForAxeRule("label")).toBe("input-label");
    expect(checkIdForAxeRule("button-name")).toBe("button-name");
    expect(checkIdForAxeRule("link-in-text-block")).toBe("use-of-color");
    expect(checkIdForAxeRule("video-caption")).toBe("video-caption");
    expect(checkIdForAxeRule("html-has-doctype")).toBe("doctype");
    expect(checkIdForAxeRule("aria-roles")).toBe("aria-role");
    expect(checkIdForAxeRule("unknown-rule")).toBeUndefined();
  });
});

describe("findingsFromAxePages", () => {
  it("builds dom locations from axe nodes", () => {
    const findings = findingsFromAxePages([
      {
        url: "https://app.example/login",
        violations: [
          {
            id: "label",
            impact: "critical",
            description: "Form elements must have labels",
            help: "Form elements must have labels",
            nodes: [
              {
                html: '<input type="email">',
                target: ["input[type=email]"],
              },
            ],
          },
        ],
      },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.checkId).toBe("input-label");
    expect(findings[0]?.engine).toBe("runtime");
    expect(findings[0]?.location).toEqual({
      kind: "dom",
      url: "https://app.example/login",
      selector: "input[type=email]",
      snippet: '<input type="email">',
    });
    expect(findings[0]?.fix).toBeNull();
  });

  it("maps a missing doctype onto the doctype check", () => {
    const findings = findingsFromAxePages([
      {
        url: "https://app.example/",
        violations: [
          {
            id: "html-has-doctype",
            impact: "moderate",
            description: "The document does not declare a document type.",
            help: "Each page must have a doctype",
            nodes: [{ html: "<html>", target: ["html"] }],
          },
        ],
      },
    ]);
    expect(findings[0]?.checkId).toBe("doctype");
    expect(findings[0]?.engine).toBe("runtime");
  });
});

describe("runtime URL helpers", () => {
  it("defaults routes to / when base URL is set", () => {
    expect(runtimeRoutesFor({ runtimeBaseUrl: "https://x.test" })).toEqual([
      "/",
    ]);
    expect(runtimeRoutesFor({})).toEqual([]);
  });

  it("joins base and route", () => {
    expect(joinRuntimeUrl("https://x.test/", "/login")).toBe(
      "https://x.test/login",
    );
  });
});

import { describe, expect, it } from "vitest";
import { clusterFindings } from "./root-cause";
import type { Control } from "@complyloop/analysis-core/contract/project-types";
import type { Finding } from "@complyloop/analysis-core/contract/finding-types";

function finding(
  id: string,
  checkId: string,
  filePath: string,
  controlId = "ctl",
): Finding {
  return {
    id,
    projectId: "p1",
    controlId,
    assessmentId: "a1",
    checkId,
    status: "open",
    kind: "violation",
    severity: "serious",
    confidence: "high",
    reason: "fail",
    location: {
      kind: "source",
      filePath,
      line: 1,
      column: 1,
      snippet: "<x />",
      span: { start: 0, end: 1 },
    },
    fix: null,
    explanations: [],
    detectedAt: "2026-01-01T00:00:00.000Z",
  };
}

function domFinding(id: string, checkId: string, url: string): Finding {
  return {
    id,
    projectId: "p1",
    controlId: "ctl",
    assessmentId: "a1",
    checkId,
    status: "open",
    kind: "violation",
    severity: "serious",
    confidence: "high",
    reason: "fail",
    location: {
      kind: "dom",
      url,
      selector: "img",
      snippet: "<img>",
    },
    fix: null,
    explanations: [],
    detectedAt: "2026-01-01T00:00:00.000Z",
  };
}

const controls: Control[] = [
  {
    id: "ctl",
    frameworkId: "fw",
    code: "WCAG 1.1.1",
    secondaryCode: "RGAA 1.1",
    title: "Images have a text alternative",
    description: "desc",
    checkId: "img-alt",
  },
  {
    id: "ctl-form-error",
    frameworkId: "fw",
    code: "WCAG 3.3.1",
    secondaryCode: "RGAA 11.10",
    title: "Form errors are associated with fields",
    description: "desc",
    checkId: "form-error-association",
  },
];

describe("clusterFindings", () => {
  it("groups multiple findings in the same file", () => {
    const clusters = clusterFindings(
      [
        finding("1", "img-alt", "components/ProductCard.tsx"),
        finding("2", "img-alt", "components/ProductCard.tsx"),
        finding("3", "img-alt", "app/page.tsx"),
      ],
      controls,
    );
    expect(clusters.some((cluster) => cluster.sharedLocation === "ProductCard.tsx")).toBe(
      true,
    );
    expect(
      clusters.find((cluster) => cluster.sharedLocation === "ProductCard.tsx")
        ?.findingIds,
    ).toHaveLength(2);
  });

  it("groups findings that share a directory across files", () => {
    const clusters = clusterFindings(
      [
        finding("1", "img-alt", "components/A.tsx"),
        finding("2", "img-alt", "components/B.tsx"),
      ],
      controls,
    );
    expect(clusters.some((cluster) => cluster.sharedLocation === "components/")).toBe(
      true,
    );
  });

  it("ignores singleton findings", () => {
    expect(
      clusterFindings([finding("1", "img-alt", "solo.tsx")], controls),
    ).toHaveLength(0);
  });

  it("clusters ContactForm-style repeated form-error findings in one file", () => {
    const clusters = clusterFindings(
      [
        finding(
          "f1",
          "form-error-association",
          "src/components/features/contact/ContactForm.tsx",
          "ctl-form-error",
        ),
        finding(
          "f2",
          "form-error-association",
          "src/components/features/contact/ContactForm.tsx",
          "ctl-form-error",
        ),
        finding(
          "f3",
          "form-error-association",
          "src/components/features/contact/ContactForm.tsx",
          "ctl-form-error",
        ),
      ],
      controls,
    );
    const fileCluster = clusters.find(
      (cluster) => cluster.sharedLocation === "ContactForm.tsx",
    );
    expect(fileCluster).toBeDefined();
    expect(fileCluster?.checkId).toBe("form-error-association");
    expect(fileCluster?.findingIds).toEqual(["f1", "f2", "f3"]);
    expect(fileCluster?.label).toContain("Form errors are associated with fields");
  });

  it("clusters DOM findings that share a URL", () => {
    const clusters = clusterFindings(
      [
        domFinding("d1", "color-contrast", "https://preview.example.com/"),
        domFinding("d2", "color-contrast", "https://preview.example.com/"),
        domFinding("d3", "color-contrast", "https://preview.example.com/other"),
      ],
      controls,
    );
    const urlCluster = clusters.find(
      (cluster) => cluster.sharedLocation === "https://preview.example.com/",
    );
    expect(urlCluster).toBeDefined();
    expect(urlCluster?.findingIds).toEqual(["d1", "d2"]);
    expect(urlCluster?.label).toContain("color-contrast");
  });

  it("clusters findings that share a PascalCase component across paths", () => {
    const clusters = clusterFindings(
      [
        finding("1", "img-alt", "src/ui/Button.tsx"),
        finding("2", "img-alt", "src/legacy/Button.tsx"),
      ],
      controls,
    );
    const componentCluster = clusters.find(
      (cluster) => cluster.sharedLocation === "Button",
    );
    expect(componentCluster).toBeDefined();
    expect(componentCluster?.findingIds).toEqual(["1", "2"]);
    expect(componentCluster?.label).toContain("component `Button`");
  });

  it("does not form a component cluster for a single path basename", () => {
    const clusters = clusterFindings(
      [
        finding("1", "img-alt", "src/ui/Button.tsx"),
        finding("2", "img-alt", "src/ui/Button.tsx"),
      ],
      controls,
    );
    expect(
      clusters.some((cluster) => cluster.id.includes(":component:")),
    ).toBe(false);
  });

  it("uses (project root) for files without a directory and skips closed findings", () => {
    const clusters = clusterFindings(
      [
        finding("1", "img-alt", "RootA.tsx"),
        finding("2", "img-alt", "RootB.tsx"),
        { ...finding("3", "img-alt", "RootC.tsx"), status: "resolved" },
      ],
      controls,
    );
    expect(
      clusters.some((cluster) => cluster.sharedLocation === "(project root)"),
    ).toBe(true);
  });
});

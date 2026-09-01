import type { Control } from "@/core/project-types";

/** Default img-alt control for server tests. */
export function testControl(partial: Partial<Control> = {}): Control {
  return {
    id: "c1",
    frameworkId: "fw",
    code: "1.1.1",
    secondaryCode: "WCAG",
    title: "Images",
    description: "Alt text",
    checkId: "img-alt",
    ...partial,
  };
}

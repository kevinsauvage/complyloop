import { rgaaControls, rgaaFramework } from "./controls";
import type { FrameworkPreset } from "@/adapters/types";

export type { FrameworkPreset };

/** RGAA 4 is a single catalog — unlike WCAG, it has no A/AA/AAA levels. */
export const rgaaPresets: FrameworkPreset[] = [
  {
    id: "preset-rgaa-full",
    name: "Full RGAA 4",
    description:
      "Every catalog control for RGAA 4.",
    frameworkId: rgaaFramework.id,
    controlIds: rgaaControls.map((control) => control.id),
  },
];

import { rgaaControls, rgaaFramework } from "./controls";
import type { FrameworkPreset } from "@/adapters/types";

/**
 * Controls that are genuinely RGAA 4: those whose primary code is an RGAA
 * criterion. The shared catalog also carries WCAG-only additions (e.g. Focus
 * Appearance 2.4.13, Target Size 2.5.8) for the WCAG presets; those have no
 * RGAA equivalent and must not leak into an RGAA assessment.
 */
const rgaaCodedControls = rgaaControls.filter((control) =>
  control.code.startsWith("RGAA"),
);

/** RGAA 4 is a single catalog — unlike WCAG, it has no A/AA/AAA levels. */
export const rgaaPresets: FrameworkPreset[] = [
  {
    id: "preset-rgaa-full",
    name: "Full RGAA 4",
    description:
      "Every RGAA 4 catalog control (WCAG-only additions are excluded).",
    frameworkId: rgaaFramework.id,
    controlIds: rgaaCodedControls.map((control) => control.id),
  },
];

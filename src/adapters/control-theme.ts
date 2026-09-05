import type { Control } from "@complyloop/domain/project-types";
import { wcagFramework } from "@/adapters/wcag/controls";

const RGAA_THEMES = [
  { id: "images", label: "Images", criterion: 1 },
  { id: "frames", label: "Frames", criterion: 2 },
  { id: "colors", label: "Colors", criterion: 3 },
  { id: "multimedia", label: "Multimedia", criterion: 4 },
  { id: "tables", label: "Tables", criterion: 5 },
  { id: "links", label: "Links", criterion: 6 },
  { id: "scripts", label: "Scripts", criterion: 7 },
  { id: "mandatory", label: "Mandatory elements", criterion: 8 },
  { id: "structure", label: "Structure of information", criterion: 9 },
  { id: "presentation", label: "Presentation of information", criterion: 10 },
  { id: "forms", label: "Forms", criterion: 11 },
  { id: "navigation", label: "Navigation", criterion: 12 },
  { id: "consultation", label: "Consultation", criterion: 13 },
] as const;

const WCAG_PRINCIPLES = [
  { id: "perceivable", label: "Perceivable", criterion: 1 },
  { id: "operable", label: "Operable", criterion: 2 },
  { id: "understandable", label: "Understandable", criterion: 3 },
  { id: "robust", label: "Robust", criterion: 4 },
] as const;

export function controlDisplayCodes(
  control: Control,
  frameworkId: string,
): { code: string; secondaryCode: string } {
  const wantWcag = frameworkId === wcagFramework.id;
  const storedAsRgaa = control.code.startsWith("RGAA");
  const storedAsWcag = control.code.startsWith("WCAG");
  if ((wantWcag && storedAsRgaa) || (!wantWcag && storedAsWcag)) {
    return { code: control.secondaryCode, secondaryCode: control.code };
  }
  return { code: control.code, secondaryCode: control.secondaryCode };
}

/**
 * Returns a copy of `control` with `code`/`secondaryCode` resolved to read as
 * the given framework's primary reference. UI that renders a control inside a
 * framework context (finding pages, dashboard, lists) should use this rather
 * than reading `control.code` raw, which can be a secondary-framework label
 * (e.g. a WCAG-coded control shown in an RGAA project).
 */
export function controlForDisplay(
  control: Control,
  frameworkId: string,
): Control {
  return { ...control, ...controlDisplayCodes(control, frameworkId) };
}

function criterionNumber(code: string): number | undefined {
  const match = /(?:RGAA|WCAG)\s+(\d+)/i.exec(code);
  if (!match) return undefined;
  return Number(match[1]);
}

export function groupControlsByTheme(
  controls: readonly Control[],
  frameworkId: string,
): { id: string; label: string; controls: Control[] }[] {
  const catalog =
    frameworkId === wcagFramework.id ? WCAG_PRINCIPLES : RGAA_THEMES;
  const buckets = new Map<string, Control[]>();
  for (const theme of catalog) {
    buckets.set(theme.id, []);
  }
  const other: Control[] = [];

  for (const control of controls) {
    const { code } = controlDisplayCodes(control, frameworkId);
    const criterion = criterionNumber(code);
    const theme = catalog.find((candidate) => candidate.criterion === criterion);
    if (theme) {
      buckets.get(theme.id)?.push(control);
    } else {
      other.push(control);
    }
  }

  const groups: { id: string; label: string; controls: Control[] }[] = catalog
    .map((theme) => ({
      id: theme.id,
      label: theme.label,
      controls: buckets.get(theme.id) ?? [],
    }))
    .filter((group) => group.controls.length > 0);

  if (other.length > 0) {
    groups.push({ id: "other", label: "Other", controls: other });
  }
  return groups;
}

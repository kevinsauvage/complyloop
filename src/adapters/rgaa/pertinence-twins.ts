/** Human pertinence twins of an automated presence check (RGAA P3.2). */
const PERTINENCE_TWIN_CONTROL_IDS = new Set([
  "ctl-img-alt-relevant",
  "ctl-frame-title-relevant",
  "ctl-transcript-relevant",
  "ctl-captions-relevant",
  "ctl-table-summary-relevant",
  "ctl-table-title-relevant",
  "ctl-link-explicit",
  "ctl-page-title-relevant",
  "ctl-label-relevant",
  "ctl-legend-relevant",
  "ctl-button-name-relevant",
]);

export function isPertinenceTwinControl(controlId: string): boolean {
  return PERTINENCE_TWIN_CONTROL_IDS.has(controlId);
}

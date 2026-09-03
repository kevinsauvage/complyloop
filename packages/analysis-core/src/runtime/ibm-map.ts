import type { CheckId } from "../types.js";

/**
 * Curated IBM Equal Access rule ids mapped to ComplyLoop check ids.
 * Only rules that add coverage axe/html-validate do not already own on the
 * rendered DOM. Full engine output is filtered through this map.
 */
const IBM_TO_CHECK: Record<string, CheckId> = {
  heading_markup_misuse: "p-as-heading",
  list_structure_proper: "list-structure",
  list_children_valid: "list-structure",
  aria_content_in_landmark: "content-region",
  aria_region_labelled: "content-region",
  aria_banner_single: "landmark-unique",
  aria_contentinfo_single: "landmark-unique",
  aria_main_label_visible: "landmark-one-main",
  aria_child_valid: "aria-required-attr",
  aria_parent_required: "aria-required-attr",
  label_ref_valid: "form-error-association",
  error_message_exists: "form-error-association",
  text_spacing_valid: "text-spacing",
  table_layout_linearized: "layout-table-linearization",
  skip_main_exists: "bypass",
  html_skipnav_exists: "bypass",
  page_title_valid: "document-title",
  fieldset_legend_valid: "fieldset-legend",
  input_label_visible: "input-label",
  aria_accessiblename_exists: "anchor-name",
  a_text_purpose: "link-explicit-heuristic",
};

/**
 * IBM rules we deliberately ignore — weaker duplicates, manual-only probes,
 * or a second target-size engine alongside axe `target-size`.
 */
export const REJECTED_IBM_RULES: ReadonlySet<string> = new Set([
  "style_focus_visible",
  "target_spacing_sufficient",
  "text_contrast_sufficient",
  "text_contrast_sufficient_PV",
  "img_alt_valid",
  "img_alt_null",
  "img_alt_decorative",
  "img_alt_redundant",
  "img_alt_misuse",
  "element_id_unique",
]);

export function checkIdForIbmRule(ibmRuleId: string): CheckId | undefined {
  if (REJECTED_IBM_RULES.has(ibmRuleId)) return undefined;
  return IBM_TO_CHECK[ibmRuleId];
}

export function ibmMappedCheckIds(): CheckId[] {
  return [...new Set(Object.values(IBM_TO_CHECK))];
}

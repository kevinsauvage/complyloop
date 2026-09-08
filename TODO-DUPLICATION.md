# TODO — Code Duplication

## P0 — Correctness / consistency

### D2. Layout-table “is layout table?” predicate copied in applicability + probe — DONE

- **Priority:** P0
- **Resolution:** Leaf `is-layout-table.ts` + `IS_LAYOUT_TABLE_SRC`; injected in
  applicability and layout-table-linearization. Shared fixtures in
  `layout-table-fixtures.ts` for presentation / implicit / data tables.

---

## P2 — Worthwhile consolidation

### D6. OrgSwitcher ≈ ProjectSwitcher

- **Priority:** P2
- **Duplication:** Near-identical auto-submit native `<select>` forms.
- **Evidence:** `src/components/org-switcher.tsx`, `src/components/project-switcher.tsx` (already share `nativeSelectClass`)
- **Impact:** Label/a11y/submit behavior drifts independently (already slightly different `max-w-*`).
- **Fix:** Extract a tiny `AutoSubmitSelectForm` (id, name, action, label, options: `{value,label}[]`, className). Keep thin Org/Project wrappers for typing and option label formatting (`github.fullName`).
- **Verification:** RTL: both still hide when ≤1 option; change still `requestSubmit`s; accessible name via Label.

### D7. Requirement status counting: `countByStatus` vs inline `Map` loops

- **Priority:** P2
- **Duplication:** Server uses `src/core/count-by-status.ts`; dashboard/requirements pages still hand-roll `Map` increments.
- **Evidence:**
  - Shared: `countByStatus` used in `src/server/assessment.ts`, `src/server/report-model.ts`
  - Dup: `src/app/(app)/dashboard/page.tsx` (~L131), `src/app/(app)/requirements/page.tsx` (~L85)
  - Consumers expect `Map`: `dashboard-status-counts.tsx`, `requirements-status-chips.tsx`
- **Impact:** Zero-fill / unknown-status behavior can diverge from reports.
- **Fix:** Add `countByStatusMap` (or `toStatusCountMap(Record)`) next to `countByStatus`; use on both pages. Optionally later switch chips to `Record` — not required.
- **Verification:** Dashboard/requirements counts match `countByStatus(..., REQUIREMENT_STATUSES)` for the same requirement list in a unit test.

### D8. Interactive control CSS selectors diverge across probes

- **Priority:** P2
- **Duplication:** Overlapping but not identical “interactive control” selectors.
- **Evidence:**
  - `non-text-contrast.ts` `CONTROL_SELECTOR`
  - `target-size-enhanced.ts` `CONTROL_SELECTOR` (disabled/type exclusions)
  - `forced-colors.ts` inline `interactiveSelector` (broader roles: slider, switch, …)
- **Impact:** A control can fail one chrome/target check and be invisible to another for no product reason.
- **Fix:** One module of named selector fragments (e.g. `BASIC_CONTROLS`, `ENHANCED_TARGET_CONTROLS`) composed per check; document intentional exclusions (disabled, checkbox size rules) next to each export.
- **Verification:** Table in a short test or comment listing which roles each probe includes; existing contrast/target/forced-colors tests green.

### D9. Error-prevention confirm attr names vs dataset keys

- **Priority:** P2
- **Duplication:** Parallel arrays that must stay aligned by hand.
- **Evidence:** `packages/analysis-core/src/patterns/error-prevention-criteria.ts` — `ERROR_PREVENTION_CONFIRM_DATA_ATTRS` vs `ERROR_PREVENTION_CONFIRM_DATASET_KEYS`
- **Impact:** Adding `data-foo` without the camelCase dataset key silently breaks the runtime probe.
- **Fix:** Derive dataset keys from `data-*` attrs with a tiny `dataAttrToDatasetKey` (or generate one array from the other at module init). Keep AST using attr names, runtime using dataset keys.
- **Verification:** Assert `attrs.length === keys.length` and round-trip mapping in `error-prevention-criteria` tests; AST + runtime error-prevention tests still pass.

### D10. Emulated-media / viewport probe scaffolding (forced-colors, reduced-motion)

- **Priority:** P2
- **Duplication:** `emulateMedia` → evaluate → `finally` restore; shared `seen` key `` `${id}\0${role}\0${tagName}` ``; similar `CustomViolation` assembly.
- **Evidence:** `forced-colors.ts`, `reduced-motion.ts` (also key pattern in `widget-keyboard.ts`, `live-region-updates.ts`)
- **Impact:** Restore-on-error and dedupe-key bugs get fixed in one probe only.
- **Fix:** Optional thin helpers only: `hitIdentityKey(el)` leaf + `withEmulatedMedia(page, opts, fn)`. Do **not** merge the detection bodies (different WCAG criteria).
- **Verification:** Existing forced-colors / reduced-motion tests; ensure `finally` still clears emulation when evaluate throws.

---

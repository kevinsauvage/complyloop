# TODO — Code Duplication

Audit of meaningful duplication (same concept / maintenance risk). Superficial resemblance and intentional AST↔runtime gaps are excluded.

**Out of scope (do not “consolidate”):**

- `src/server/orgs.ts` vs `packages/db/src/repo/orgs.ts` — domain vs persistence layers
- `media-keyboard` vs `media-keyboard-static` — different tags/criteria (video/audio vs object/embed)
- `hover-content` vs `css-hover-keyboard` — already share `measureHoverVsFocusReveal`
- Exception vs finding-dismissal reason option lists — different domain enums
- Full merge of AST + Playwright captcha/auth checks into one implementation — different hosts (TS AST vs DOM); share **criteria** only

---

## P0 — Correctness / consistency

### D2. Layout-table “is layout table?” predicate copied in applicability + probe

- **Priority:** P0
- **Duplication:** Identical `isLayoutTable` logic in two evaluate callbacks.
- **Evidence:**
  - `packages/analysis-core/src/runtime/custom-checks/layout-table-linearization.ts` (`isLayoutTable`)
  - `packages/analysis-core/src/runtime/applicability.ts` (`isLayoutTable` inside `applicabilityObservationsForPage`)
- **Impact:** Applicability marks `layout-table-linearization` N/A when “no layout table”; if predicates drift, requirements can be `not_applicable` while the probe still finds (or misses) violations.
- **Fix:** Move `isLayoutTable` to a leaf module (no imports), export `IS_LAYOUT_TABLE_SRC = isLayoutTable.toString()`, inject in both evaluate payloads (same pattern as `hit-capture.ts` / `captcha-candidates.ts`).
- **Verification:** Unit-test the pure function; applicability + linearization tests share the same HTML fixtures for presentation vs data tables.

---

## P1 — High maintenance risk

### D4. Dual DOM hit capture APIs (`captureHit` vs `captureDomTarget`)

- **Priority:** P1
- **Duplication:** Two locator/snippet pipelines for Playwright custom findings.
- **Evidence:**
  - Lightweight: `hit-capture.ts` + `widget-keyboard-utils.ts` (`selectorOf` / `selectorRef`) — used by ~20 custom checks
  - Rich: `runtime/dom-target.ts` `captureDomTarget` — used by `focus.ts` (and serialized via `.toString()`)
  - Snippet truncation also inlined in `dom-target.ts` and documented copy in `html-validate-runtime.ts` (`dom-location.ts` comments)
- **Impact:** Focus findings get CSS-path selectors + accessible names; other custom checks often get `#id` / `[role]` / tagName. Snippet/locator improvements must be made twice; UI location quality is inconsistent.
- **Fix:** Prefer extending `BROWSER_HIT_CAPTURE_SRC` (or a second exported browser bundle) with optional richer selector/name fields, then migrate focus probes to that API. Do **not** invent a third capture path. Keep html-validate’s deliberate serialized copy but add a comment + shared constant for the `197` truncation length if missing.
- **Verification:** Snapshot selectors/snippets for one focus finding and one media/reflow finding before/after; existing focus + custom-check tests green.

### D5. `new Function(...hitCaptureSrc)` reconstitution boilerplate ×19

- **Priority:** P1
- **Duplication:** Same 2–4 lines reconstructing `{ captureHit }` inside almost every `page.evaluate`.
- **Evidence:** `rg -F 'new Function(\`return (${hitCaptureSrc})\`)'`under`packages/analysis-core/src/runtime/custom-checks/` (media-keyboard, forced-colors, reflow, captcha-\*, non-text-contrast ×2, …)
- **Impact:** Easy to regress Vite SSR constraint (must not embed `captureHit.toString()` — see `hit-capture.ts` comments). New checks copy-paste wrong variants.
- **Fix:** Small shared browser prelude string, e.g. export `HIT_CAPTURE_BOOTSTRAP` that is the reconstruct expression, or a `loadHitCapture(hitCaptureSrc)` leaf function stringified once and composed into `BROWSER_HIT_CAPTURE_SRC`. Call sites only destructure `captureHit`. Keep CSP/`new Function` caveat documented in `multilingual.ts`.
- **Verification:** Count of reconstruct sites drops to the bootstrap module; custom-check unit/integration tests still pass.

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

## P3 — Minor

### D11. Evidence summary string templates still partially ad hoc

- **Priority:** P3
- **Duplication:** `remediationEvidenceSummary` covers approved/implemented/verified; AI suggest / dismiss / cleared still inline `formatLocationRef` templates.
- **Evidence:** `src/server/remediation-evidence.ts` vs `remediation-ai.ts`, `remediation.ts` (dismiss), `assessment-findings.ts` (cleared)
- **Impact:** Wording inconsistency in evidence timeline only.
- **Fix:** Extend the helper with a small event union (`ai_suggested` | `dismissed` | `cleared`) **only if** copy should stay uniform; otherwise leave alone.
- **Verification:** Grep evidence summaries in action tests; no behavior change beyond string equality.

### D12. `htmlSnippet` truncation magic number

- **Priority:** P3
- **Duplication:** `200` / `197` … appears in `dom-location.ts`, `dom-target.ts`, `html-validate-runtime.ts`.
- **Fix:** Export `HTML_SNIPPET_MAX = 200` from `dom-location.ts`; reference in comments for serialized copies that cannot import.
- **Verification:** Existing snippet assertions unchanged.

---

## Already improved (do not re-litigate)

- Shared multilingual / captcha / confirm patterns → `patterns/multilingual.ts`, `patterns/error-prevention-criteria.ts`
- Object-recognition captcha criteria (AST + runtime) → `patterns/object-recognition-captcha.ts` + DOM leaf in `captcha-candidates.ts` (D1)
- Captcha collect/match browser sources → `BROWSER_COLLECT_CAPTCHA_SRC` / `BROWSER_CAPTCHA_MATCH_SRC` (D3)
- Browser hit capture → `runtime/custom-checks/hit-capture.ts`
- Hover measure helper → `hover-reveal.ts`
- Native select class → `src/components/ui/native-select.ts`
- Reason/note fields → `src/components/reason-note-fields.tsx`
- Remediation lifecycle evidence summary → `src/server/remediation-evidence.ts`
- Human determination mutual exclusion → `src/server/requirement-human-determination.ts`
- Server status aggregation → `src/core/count-by-status.ts` (pages still catching up — D7)

# ComplyLoop Implementation TODO

## Executive Summary

ComplyLoop already has a real multi-engine accessibility pipeline: custom AST checks + `eslint-plugin-jsx-a11y` on TSX, Playwright + axe-core on preview URLs, a curated `html-validate` pass on the serialized live DOM, IBM Equal Access as a sibling engine, Playwright behaviour probes, theme/target-size condition passes, and site-level + linkinator checks. Findings merge into catalog controls with authority classes (`runtime_only`, `composition_sensitive`, `heuristic`, `site_level`). AI never sets status.

The analyzer is **not yet trustworthy enough to treat a green requirement as compliance evidence** for every runtime-only control, but the three P0 defects that emitted or suppressed wrong RGAA status are **fixed** (see Completed below).

`html-validate` is scoped to **RGAA 8.2 and 10.1 structural evidence only** on the generated DOM. Runtime observations now carry optional `analyzerId` / `analyzerRuleId` (axe, html-validate, IBM, playwright-custom, site-level, linkinator); same check + dom node is deduped per page with contributing analyzers preserved. Coarse `engine: "ast" | "runtime"` remains for remediation routing.

Do not add another scanner. Next: isolate engine failures, gate 8.2/10.1 on `htmlValidateRan`, stop over-passing applicability-gated checks. Empty runtime-only scans currently **pass** requirements (including CAPTCHA, hover content, media) — that is a compliance overclaim, not a coverage gap.

This document replaces the previous product-ops `todo.md` for analyzer work. Ops go-live items (deploy checklist, backups, Sentry alerts) still live in `docs/deploy.md` and are out of scope here.

## Current Architecture

```
SOURCE (CI + assessment, no browser)
  AST custom checks (58) ─┐
  eslint-plugin-jsx-a11y ─┴─► RawFinding (engine: ast)
         │
         ▼
  filterAstFindingsForAuthority() when runtime ran
         │ drop composition-sensitive, runtime-only, package-twin source hits
RENDERED / RUNTIME (only if project.runtimeBaseUrl is set)
  Playwright page.goto (networkidle)
         ├─ axe-core (disk axe.min.js)
         ├─ custom Playwright probes (complyloop-* ids mapped in axe-map.ts)
         ├─ html-validate on custom-serialized live DOM
         ├─ page snapshot (site-level)
         ├─ axe target-size at default, 320×568, pointer: coarse
         ├─ IBM Equal Access (dedupe vs axe by check id, then snippet)
         └─ theme-sensitive re-run (implemented, never called from assessment)
         │
         ├─ site-level checks (≥2 routes)
         └─ linkinator (same-origin)
                ▼
         RawFinding (engine: runtime)
                ▼
  mergeRawFindings → createFinding → deriveRequirementStatus
                ▼
  Finding + append-only EvidenceRecord (detail.engine = ast | runtime)
```

**Status derivation** (`deriveRequirementStatus`): sticky human decisions win; open `violation` → `failed`; open `warning` → `needs_review`; else authority gate. `runtime_only` with no findings and `runtimeRan` → **`passed`**. `htmlValidateRan` / `ibmCheckerRan` are stored on the assessment and never consulted.

**CLI** (`npx complyloop-check` / `src/cli/check.ts`): AST + jsx-a11y only. Exit 1 on violations. No runtime, no JSON.

**Layers observed in the repo (do not reshuffle without a concrete reason):**

| Layer | Owner today |
| --- | --- |
| Source AST / JSX | `packages/analysis-core/src/checks/`, `jsx-a11y-scan.ts` |
| Rendered a11y tree | axe-core via `runtime/scan.ts` |
| Rendered HTML structure | html-validate via `runtime/html-validate-runtime.ts` |
| Browser behaviour | `runtime/custom-checks/` |
| Site / cross-route | `runtime/site-level/` + `link-check.ts` |
| Human | catalog `checkId: null` + heuristic empty → `unable_to_verify` |

## Priority Overview

| Priority | Count | Focus |
|---|---:|---|
| P0 | 0 | — (critical items completed 2026-09-04) |
| P1 | 11 | engine isolation, over-pass, dead theme pass, tests |
| P2 | 8 | Applicability, probe quality, SSR HTML capture, CLI evidence |
| P3 | 6 | Docs drift, `networkidle`, IBM install weight, serializer cleanup |
| P4 | 5 | Visual regression, SR automation, extra engines — do not start |

## Recommended Execution Order

1. **#7–#9** Isolate engine failures; gate 8.2/10.1 on `htmlValidateRan`; stop auto-passing applicability-gated runtime-only checks.
2. **#10–#14** Restore page after submit/hover probes; wire theme conditions; fix resize-text; fix remaining mapping/help mismatches.
3. **#15–#17** Tests that lock the above (especially false-positive regressions).
4. **#18+** Coverage and quality only after the pipeline stops lying.

---

## Completed (2026-09-04)

### P0 — css-off-understandable page contamination

- `css-off-understandable.ts`: snapshot and restore stylesheets in a `finally` block inside the page evaluate.
- `custom-checks/index.ts`: run css-off on the sequential mutating path (not `Promise.all` with contrast/spacing).
- `css-off-understandable.test.ts`: regression test that computed styles remain after the check.

### P0 — cross-route duplicate-id false fails

- `site-level/checks.ts`: removed site-level `duplicate-id` for shared ids across routes (per-document uniqueness stays on axe / AST).
- `site-level/checks.test.ts`: regression test that `#header` on two routes does not fail.

### P0 — consistent-lang vs RGAA 8.4

- `site-level/checks.ts`: `consistent-lang` is now `kind: "warning"` (needs_review), not a violation against 8.4.
- `controls.ts`: recoded `ctl-consistent-lang` to RGAA 8.3 with review-oriented copy; `ctl-html-lang-valid` remains the only 8.4 automated control.
- `guidance.ts`: updated impact/how-to-fix for review semantics.

### P1 — Restrict html-validate to RGAA 8.2 / 10.1 structural evidence

- `html-validate-map.ts`: removed `no-multiple-main`, `unique-landmark`, and `no-missing-references` mappings; only `markup-nesting` and `css-for-presentation` remain.
- `html-validate-runtime.ts`: `RENDERED_RULES` trimmed to 7 rules (8.2 markup + 10.1 presentation).
- `html-validate-runtime.test.ts`: asserts landmarks, broken idrefs, and duplicate ids do not emit html-validate findings.

### P1 — duplicate-id exclusive ownership (axe runtime, not html-validate)

- Removed `no-dup-id` from html-validate `RENDERED_RULES` and map — axe owns rendered DOM duplicate ids; AST owns source.
- IBM skip simplified (axe node match only); dedupe kept for IBM vs axe same-node overlap.
- `docs/ai/architecture.md`, `docs/analysis-checks-challenge.md`: updated scope and rule count.

### P1 — Analyzer identity on observations + runtime dedupe

- `types.ts` / `contract/finding-types.ts`: optional `analyzerId`, `analyzerRuleId`, `analyzerVersion`, `contributingAnalyzers` on findings.
- All runtime engines tag observations (`axe`, `html-validate`, `ibm`, `playwright-custom`, `site-level`, `linkinator`); jsx-a11y tagged separately from custom AST.
- `runtime/dedupe-runtime-findings.ts`: collapses same check + dom node per page (axe > IBM > custom); merged analyzers kept on survivor. html-validate check ids do not overlap axe.
- `ibm-runtime.ts`: skip only when axe already reported the **same node**, not any hit of the check id.
- `assessment-findings.ts`: persists analyzer fields on findings and `finding_detected` evidence detail.

---

## Analyzer coverage matrix

| Layer | Engine | Input | Current role | RGAA/WCAG | Status |
| --- | --- | --- | --- | --- | --- |
| Source | Custom AST (`checks/`, 58) | TSX/JSX | React patterns jsx-a11y cannot see; CI gate | Many (CAPTCHA cues, office docs, heuristics, …) | Active. Heuristic ids do not pass on empty scan. |
| Source | `eslint-plugin-jsx-a11y` (28 mapped rules) | TSX | CI source twin | img-alt, names, ARIA, keyboard heuristics | Active. `control-has-associated-label` is intentionally off. |
| Rendered DOM | axe-core (~123 mapped rules) | Live page via `axe.min.js` | Baseline a11y tree | Broad WCAG; mapped through `axe-map.ts` | Active. Incomplete nodes → `warning` / `needs_review`. |
| Rendered HTML | html-validate (7 curated rules) | Custom-serialized `document.documentElement` | RGAA 8.2 markup + 10.1 presentation only | 8.2 (`markup-nesting`), 10.1 (`css-for-presentation`) | Active. Not used by CLI. Duplicate ids: axe runtime + AST. |
| Rendered DOM | IBM Equal Access (15 curated rules) | Same Playwright page after axe | Sibling engine; skip when axe already reported same node | Landmarks, lists, form errors, skip link, … | Active. Node-level skip (not check-id blanket). Throws abort the whole runtime scan. |
| Runtime | Playwright custom (~26 probes) | Browser (tab, emulateMedia, viewport) | Behaviour axe cannot see | Focus, reflow, widgets, hover, live regions, 44×44, forced-colors, reduced-motion, … | Active. css-off restore fixed; submit/hover probes still mutate page (#11). |
| Runtime conditions | Theme pass (`theme-conditions.ts`) | dark / light / `prefers-contrast: more` | Re-run contrast/focus under theme | 1.4.3 / 1.4.6 / 1.4.11 | **Dead in product assessments** — `scanRuntime` accepts `browserConditions` but `src/server/assessment.ts` never passes them. |
| Runtime conditions | Viewport / pointer (`viewport-conditions.ts`) | default, `320×568`, `pointer: coarse` | axe `target-size` 24×24 | 2.5.8 / RGAA target size | Active. |
| Site | `site-level/checks.ts` | Snapshots across ≥2 routes | Nav/help/title/landmark consistency | 12.x, 8.6, 9.1 | Active. Cross-route `duplicate-id` removed; `consistent-lang` is warning/review (not 8.4 fail). |
| Site | linkinator (`link-check.ts`) | Same-origin URLs + fragment ids | Broken links | RGAA 6.2 (`broken-link`) | Active. SSRF-guarded. |
| Human | Manual catalog (`checkId: null`, 26) | Rendered UI | Pertinence, quality, flash, AT media | 1.3, 1.4, 3.1, 4.13, … | Correct: stays `unable_to_verify` until human pass/exception. |

**Catalog:** 156 RGAA/WCAG controls in `src/adapters/rgaa/controls.ts`; 130 automated (`checkId` set), 26 manual. Full RGAA preset includes only controls whose `code` starts with `RGAA` (WCAG-only AAA extras such as 2.4.13 stay out of RGAA assessments).

---

## P1 — Core correctness

### [P1] Isolate runtime engines so IBM or html-validate failure does not discard axe findings

**Location**
- `packages/analysis-core/src/runtime/scan.ts` (`createPlaywrightAxeScanner`)
- `packages/analysis-core/src/runtime/ibm-runtime.ts`
- `packages/analysis-core/src/runtime/html-validate-runtime.ts`

**Problem**

html-validate and IBM run inside the same `try` as axe and custom checks. If `ibmFindingsForPage` or `htmlValidateFindingsForPage` throws, the page is not pushed; the outer `scanRuntime` catch returns `{ findings: [], pagesScanned: 0, error }`. Axe results from that run are thrown away. `htmlValidateRan` / `ibmCheckerRan` are then both `pages.length > 0` — they cannot represent “axe ran, IBM failed”.

**Why it matters**

One flaky IBM import or html-validate crash makes every runtime-only control `unable_to_verify` and can reopen resolved findings. Opposite of “evidence over claims”: you lose evidence.

**Recommended change**

Per page: catch html-validate and IBM independently; keep axe + custom findings; set `htmlValidateRan` / `ibmCheckerRan` from actual success; record `runtimeError` as a non-fatal per-engine warning (existing `runtimeError` string may need structured detail). Do not mark `markup-nesting` passed if html-validate did not run (#8).

**Acceptance criteria**
- [ ] Forced IBM throw still returns axe `img-alt` findings and `pagesScanned > 0`.
- [ ] `ibmCheckerRan === false`, `htmlValidateRan` reflects html-validate success.
- [ ] `markup-nesting` does not become `passed` when html-validate did not run.
- [ ] Test with injected scanner/stubs.

**Dependencies**
- #8 for status gating.

---

### [P1] Gate RGAA 8.2 / 10.1 pass on html-validate actually running, not on “any runtime page”

**Location**
- `packages/analysis-core/src/contract/requirement-status.ts`
- `src/server/assessment-status.ts` (`statusFromFindings` ignores `htmlValidateRan`)
- `src/server/assessment.ts` (stores the flag, does not pass it into derivation)
- `packages/analysis-core/src/check-authority.ts` (`markup-nesting`, `css-for-presentation` are `runtime_only`)

**Problem**

`markup-nesting` and `css-for-presentation` are `runtime_only`. Empty findings + `runtimeRan` → **`passed`**. `runtimeRan` is “Playwright scanned at least one page with no thrown scan error”. It does not mean html-validate produced a verdict. After #7, axe can succeed while html-validate is skipped; 8.2/10.1 would still pass.

Architecture comments say a clean html-validate audit can pass 8.2. That is only true if html-validate ran.

**Why it matters**

8.2/10.1 would be marked passed with no structural evidence.

**Recommended change**

Either a dedicated authority class for html-validate-owned ids, or pass `htmlValidateRan` into `deriveRequirementStatus` for `markup-nesting` and `css-for-presentation` (and `duplicate-id` only if html-validate is considered a required 8.2 source — prefer: duplicate-id can still pass from axe; markup-nesting and css-for-presentation require html-validate).

**Acceptance criteria**
- [ ] Runtime axe-only (html-validate skipped) → `markup-nesting` and `css-for-presentation` stay `unable_to_verify`.
- [ ] html-validate ran, zero findings → those two can `passed`.
- [ ] `duplicate-id` still fails when axe reports it even if html-validate is skipped.
- [ ] Unit tests on `deriveRequirementStatus` / assessment-status.

**Dependencies**
- #4 (html-validate owns those ids). #7 (flag can be false while runtimeRan is true).

---

### [P1] Do not auto-pass applicability-gated runtime-only checks from “no observation”

**Location**
- `packages/analysis-core/src/contract/requirement-status.ts` (`runtime_only` + no findings → `passed`)
- `packages/analysis-core/src/check-authority.ts` (`captcha-alternative`, `hover-content`, `media-identification`, `media-keyboard`, `layout-table-linearization`, `error-prevention`, `accessible-auth-enhanced`, …)
- `src/adapters/rgaa/controls.ts` (those controls)

**Problem**

Product rule: “no video on this page is **not applicable**, not a failure” (`docs/analysis-strategy.md`). Implementation: no CAPTCHA / hover overlay / layout table observed → requirement **`passed`**. `hover-content` is listed as both `runtime_only` and `heuristic`; precedence makes it `runtime_only`, so an empty probe **passes RGAA 10.13**. Contrast with `reduced-motion`, which is heuristic-only and correctly stays `unable_to_verify` when nothing is flagged.

`not_applicable` exists on requirements but analyzers never emit applicability. Humans set N/A via exception/dismissal.

**Why it matters**

A page with no detected CAPTCHA is not RGAA 1.5 compliant; 1.5 may not apply. Passing 10.13 because the probe only inspected `[title], [aria-describedby], [data-tooltip], [aria-haspopup]` is an overclaim.

**Recommended change**

Split runtime-only ids:

- **Presence/quality of a pattern** (CAPTCHA, media, layout tables, hover content, error-prevention): empty probe → `unable_to_verify` or `not_applicable` only with an explicit applicability observation (e.g. “no form with image CAPTCHA”). Prefer `unable_to_verify` until applicability is first-class.
- **Always-applicable page rules** (contrast, focus visible, doctype, markup-nesting): empty + engine ran → `passed`.

Align `hover-content` / `label-adjacent` with heuristic-or-applicability behaviour, not silent pass. Do not invent a new scanner to “detect absence”.

**Acceptance criteria**
- [ ] Preview audit with no CAPTCHA markup does not set `ctl-captcha-alternative` to `passed`.
- [ ] Preview audit with no hover triggers does not set `ctl-hover-content` to `passed`.
- [ ] `color-contrast` with axe ran and no violations can still `passed`.
- [ ] Tests for both classes in `deriveRequirementStatus`.

**Dependencies**
- None (authority lists). Coordinates with #5 if applicability becomes an observation kind.

---

### [P1] Sequentialize and restore page state after submit / live-region / hover probes

**Location**
- `packages/analysis-core/src/runtime/custom-checks/form-error-submit.ts` (clicks submit, `waitForTimeout(150)`, no restore)
- `packages/analysis-core/src/runtime/custom-checks/live-region-updates.ts` (clicks submit or **any** `button`, no restore)
- `packages/analysis-core/src/runtime/custom-checks/hover-content.ts` (hover + Escape; mouse move to 0,0)
- `packages/analysis-core/src/runtime/custom-checks/index.ts` (order: form-error → live-region → hover → forced-colors → …)
- `packages/analysis-core/src/runtime/custom-checks/non-text-contrast.ts` (hovers up to 12 controls)

**Problem**

Comments claim mutating checks restore state. `form-error-submit` and `live-region-updates` leave the page in a submitted/invalid UI. `live-region-updates` will click a random non-disabled button if no form submit exists (cookie banner, “Open menu”). Later sequential probes (forced-colors, reflow) still see mutated DOM.

**Why it matters**

False focus/live-region/widget findings after an accidental click; or missed findings because a dialog now covers the page.

**Recommended change**

Use `page.reload` or snapshot/restore URL after destructive probes, or run them last on a **clone page** (`context.newPage` + same URL) so the audit page stays pristine. Stop clicking an arbitrary button; only interact with a control that the check’s hypothesis requires. Replace `waitForTimeout` with waiting for a specific validation attribute/role where possible.

**Acceptance criteria**
- [ ] After form-error and live-region probes, the original URL and a known heading still exist for the next check (test).
- [ ] Live-region check does not click unrelated buttons.
- [ ] Forced-colors / reflow tests still pass on a page that also has a form.

**Dependencies**
- None.

---

### [P1] Wire the theme-condition pass into assessments or stop advertising it as shipped

**Location**
- `packages/analysis-core/src/runtime/theme-conditions.ts`
- `packages/analysis-core/src/runtime/scan.ts` (`ScanRuntimeOptions.browserConditions`)
- `src/server/assessment.ts` (`scanRuntime({ … })` — no `browserConditions`)
- `docs/analysis-checks-challenge.md` / `docs/analysis-strategy.md` (describe theme pass as current)

**Problem**

Theme-sensitive axe rules (`color-contrast`, `color-contrast-enhanced`, `link-in-text-block`) and custom focus/contrast can re-run under dark / light / `prefers-contrast: more`. Product assessments never pass `browserConditions`. Docs and the challenge inventory treat this as shipped.

**Why it matters**

Contrast can pass in the default scheme and fail in dark mode with no evidence. The code exists; the product loop does not use it.

**Recommended change**

Pass a default set (at least `dark` and `light`) from `runAssessment` into `scanRuntime`. Keep condition-specific findings labeled (`[dark only]`). Do not combinatorially re-run every check. If cost is too high, document it as unused and remove the “shipped” language — do not leave a dead path that looks like coverage.

**Acceptance criteria**
- [ ] An assessment with `runtimeBaseUrl` requests theme conditions (logged on `AssessmentEngines` or evidence).
- [ ] A page that fails contrast only under `colorScheme: dark` produces a finding whose reason/context names `dark`.
- [ ] Default-scheme-only failures are not duplicated as condition findings (`conditionSpecificViolations` already does this — cover with an assessment-level test).

**Dependencies**
- None.

---

### [P1] Stop implementing WCAG 1.4.4 resize at 320×568 (that is 1.4.10)

**Location**
- `packages/analysis-core/src/runtime/custom-checks/resize-text.ts`
- `src/adapters/rgaa/controls.ts` (`ctl-resize-text`, RGAA 10.4 / WCAG 1.4.4)
- `packages/analysis-core/src/runtime/custom-checks/reflow.ts` (already 320×568 for 1.4.10)

**Problem**

`resizeTextViolation` sets viewport to **320×568**, sets `documentElement.style.fontSize = "200%"`, then fails on horizontal overflow or clipped overflow:hidden text. If overflow exists but no clipped descendant is found, it still reports the **root** as the node. WCAG 1.4.4 / RGAA 10.4 is 200% text at a **normal** viewport without requiring two-dimensional scroll. 320 CSS px without 2D scroll is 1.4.10 / `reflow`.

**Why it matters**

Pages that reflow correctly at 320px but use a wide desktop layout at 200% zoom will fail 10.4 incorrectly — or 10.4 and 10.11 will double-count the same overflow.

**Recommended change**

Run 200% text resize at the default viewport (or 1280×1024 as WCAG commonly illustrates). Leave 320×568 to `reflow`. If overflow is the only signal, require a clipped text node; do not fail the whole `html` element. Restore `fontSize` (already in `finally`) and viewport (already).

**Acceptance criteria**
- [ ] A page that only overflows at 320px fails `reflow`, not `resize-text`.
- [ ] A page that clips text at 200% on desktop viewport fails `resize-text`.
- [ ] Playwright tests for both cases.
- [ ] `fontSize` is cleared even when the evaluate throws (already attempted — add a throw test).

**Dependencies**
- None.

---

### [P1] Fix `form-error-submit` criterion mismatch (help says RGAA 11.11, check is 11.10)

**Location**
- `packages/analysis-core/src/runtime/custom-checks/form-error-submit.ts` (maps via `complyloop-form-error-submit` → `form-error-association`)
- `packages/analysis-core/src/runtime/axe-map.ts`
- `src/adapters/rgaa/controls.ts` (`ctl-form-error-association` = 11.10; `ctl-error-suggestion` = 11.11)

**Problem**

The submit probe checks programmatic association and focus after invalid submit — that is RGAA 11.10 / WCAG 3.3.1, correctly mapped to `form-error-association`. The `help` string cites **RGAA 11.11**. 11.11 is `error-suggestion` (heuristic AST, correction quality) and must stay human/heuristic.

**Why it matters**

Guidance and reports attribute the finding to the wrong criterion. Easy to “fix” 11.11 by adding `aria-describedby` without suggesting a correction.

**Recommended change**

Change help/guidance to RGAA 11.10 / WCAG 3.3.1. Do not map this probe to `error-suggestion`. Keep 11.11 as `unable_to_verify` without a quality-of-message engine.

**Acceptance criteria**
- [ ] Probe still emits `form-error-association` only.
- [ ] Copy references 11.10, not 11.11.
- [ ] `error-suggestion` remains heuristic / not passed by this probe.

**Dependencies**
- None.

---

### [P1] Stop using `[aria-describedby]` as a hover-content trigger (WCAG 1.4.13 / RGAA 10.13)

**Location**
- `packages/analysis-core/src/runtime/custom-checks/hover-content.ts`

**Problem**

Triggers are `[title], [aria-describedby], [data-tooltip], [aria-haspopup='true']`. `aria-describedby` is a **static accessible description**, not extra content revealed on hover. Hovering those nodes and measuring `document.body.innerText` length easily false-positives (description already in the DOM) or false-negatives (native `title` tooltips do not change `innerText`, so they are skipped).

**Why it matters**

10.13 findings that are really 11.1/4.1.2 description associations, or missed CSS tooltips.

**Recommended change**

Drop `[aria-describedby]` from the trigger list. Prefer `:hover` content that is `visibility`/`display` toggled, `[role=tooltip]`, or pointer-driven popovers. Keep Escape-dismiss + keyboard-equivalent as the actual 1.4.13 questions. Emit `warning` when confidence is medium. Pair with #9 so “no triggers found” is not a pass.

**Acceptance criteria**
- [ ] A labelled input with `aria-describedby` pointing at visible hint text does not fail `hover-content`.
- [ ] A CSS tooltip that appears on hover and does not close on Escape does fail (or `needs_review` if that case is still too heuristic — document which).
- [ ] Native `title`-only is not silently treated as a 1.4.13 pass of the page (#9).

**Dependencies**
- #9 for pass/fail policy.

---

### [P1] html-validate 8.2 evidence must describe what was actually validated (repaired live DOM)

**Location**
- `packages/analysis-core/src/runtime/html-validate-runtime.ts` (`serializeDocument` walks the **live** tree, skips comments, omits doctype, starts at `document.documentElement`)
- `packages/analysis-core/src/contract/finding-types.ts` (`EvidenceRecord.detail`)

**Problem**

RGAA 8.2 is validity of **generated** HTML. The pass serializes the post-parse DOM with a custom walker, then validates that string. Browser (or SSR parser) repair of illegal nesting never appears. Architecture already notes interactive nesting is repaired and left to axe — the same limitation applies to `p > div`, implied `</p>`, etc. A clean result is “no issues in this serialization”, not “the HTTP/SSR source is valid HTML5”.

`elementAtOffset` maps line/column to the last element whose start offset is `<=` the message offset — closing-tag messages can attach to the wrong node. Confidence is always `high`.

**Why it matters**

`passed` 8.2 after #8 would over-state what was proved. Findings with selector `(document)` or a sibling element are weak evidence.

**Recommended change**

Record in evidence: input kind (`live-dom-serialization`), html-validate version, rule ids enabled, whether doctype was included. Lower confidence or keep 8.2 at `needs_review` for SSR-heavy apps until a document-response capture exists (#20). Fix offset mapping tests for errors on closing tags. Optional later: validate `page.content()` or the navigation response body **in addition**, still mapped only to 8.2/10.1, deduped (#6).

**Acceptance criteria**
- [ ] `finding_detected` / assessment evidence for markup-nesting includes analyzer + “live DOM serialization” (or equivalent).
- [ ] Unit test: message on a closing tag maps to that element, not an unrelated later sibling.
- [ ] Docs state the repair limitation; UI reason does not say “source HTML is valid” unless response HTML was checked.

**Dependencies**
- #5, #8. #20 is follow-up, not a blocker for honest evidence.

---

### [P1] Lock P0/P1 behaviour with tests that currently encode the bugs or omit them

**Location**
- `packages/analysis-core/src/runtime/custom-checks/css-off-understandable.test.ts` (no restore assertion)
- `packages/analysis-core/src/runtime/custom-checks/index.test.ts` (mocks; does not test execution order vs mutation)
- `packages/analysis-core/src/runtime/site-level/checks.test.ts` (requires cross-route duplicate-id)
- `packages/analysis-core/src/runtime/html-validate-runtime.test.ts` (requires landmark and form-error mappings)
- `packages/analysis-core/src/contract/requirement-status.test.ts`
- `src/server/assessment.test.ts`

**Problem**

Tests prove today’s behaviour, including incorrect behaviour. html-validate tests fail if #4 is fixed unless they change. There is no assessment test that `browserConditions` are requested. There is no test that html-validate throw preserves axe findings.

**Why it matters**

Without these tests, #4–#8 will regress. Passing the existing suite is not evidence of correctness.

**Recommended change**

Add/replace tests as acceptance criteria of #4–#14. Prefer Playwright page tests for mutation/restore; unit tests for maps and `deriveRequirementStatus`.

**Acceptance criteria**
- [ ] Each remaining P1 item above has a failing test before the fix (or a new test that would have caught it).
- [ ] `npm run test` covers: html-validate map ⊆ {markup-nesting, css-for-presentation}, engine isolation, 8.2 gated on htmlValidateRan, no auto-pass CAPTCHA.

**Dependencies**
- Lands with #4–#14, not as a vague “add more tests” leftover.

---

## P2 — Coverage

### [P2] First-class applicability observations (media, CAPTCHA, tables) instead of pass/fail only

**Location**
- `packages/analysis-core/src/contract/requirement-status.ts`
- Custom checks: `captcha-alternative.ts`, `media-identification.ts`, `media-keyboard.ts`, `layout-table-linearization.ts`
- `src/adapters/rgaa/controls.ts`

**Problem**

Follows #9. Domain already has `not_applicable`. Engines never emit “this criterion does not apply on this page”.

**Why it matters**

Honest RGAA: 4.x N/A when there is no temporal media; 1.5 N/A when there is no CAPTCHA; 5.3 N/A when there is no layout table.

**Recommended change**

If a probe can **deterministically** assert absence (no `video`/`audio`/`track`, no captcha iframe/class, no `table` without `th`), emit an applicability observation that derivation maps to `not_applicable` with evidence. If absence is heuristic, keep `unable_to_verify`. Never auto-fail for absence.

**Acceptance criteria**
- [ ] Page without media → relevant 4.x controls `not_applicable` or `unable_to_verify`, never `passed` from silence.
- [ ] Page with `<video>` and no captions still `failed` / `needs_review` as today.
- [ ] Evidence states the applicability fact (e.g. “no video/audio elements in audited DOM”).

**Dependencies**
- #9, #5.

---

### [P2] Capture navigation/SSR HTML as a second 8.2 input (not a second scanner)

**Location**
- `packages/analysis-core/src/runtime/scan.ts` (`page.goto`)
- `packages/analysis-core/src/runtime/html-validate-runtime.ts`

**Problem**

Live-DOM serialization misses parser-repaired SSR (`#13`). Playwright has the document response on `goto`.

**Why it matters**

Closer to RGAA 8.2 “generated source” for Next.js SSR without adding Nu HTML Checker.

**Recommended change**

Optionally validate the main-frame response body with the **same** 8.2/10.1 rule subset. Dedupe with the live-DOM pass (#6). Ignore non-HTML responses. Do not run this in the CLI.

**Acceptance criteria**
- [ ] SSR `<p><div></div></p>` that the parser repairs still produces `markup-nesting` from the response body.
- [ ] Client-only React invalid nesting still caught on live DOM.
- [ ] Same rule allowlist as #4.

**Dependencies**
- #4, #6, #13.

---

### [P2] Reduce `css-disabled-content` false positives on decorative pseudo-elements

**Location**
- `packages/analysis-core/src/runtime/custom-checks/css-disabled-content.ts`

**Problem**

Any `body *` with no direct text node and non-empty `::before`/`::after` content (and often a background image, or content length ≥ 2) becomes RGAA 10.2. Icon fonts, chevrons, required-field asterisks in CSS will fail.

**Why it matters**

10.2 noise trains teams to ignore structural CSS findings, including real html-validate 10.1 hits.

**Recommended change**

Skip content that is purely symbolic (single character, typical icon Unicode, `content` that is not words). Require that pseudo text looks like words **or** that background-image is the only bearer of a text-looking string. Prefer `warning` / medium confidence. Do not duplicate html-validate deprecated-presentational markup.

**Acceptance criteria**
- [ ] A button with a CSS chevron `::after` and visible text does not fail.
- [ ] A heading whose only letters are in `::before { content: "Chapter 1" }` still fails.
- [ ] False-positive fixture checked in.

**Dependencies**
- None.

---

### [P2] `live-region-updates` should not treat marketing copy or arbitrary clicks as WCAG 4.1.3

**Location**
- `packages/analysis-core/src/runtime/custom-checks/live-region-updates.ts`

**Problem**

After clicking a form submit or any button, new `p|div|span|li|output` nodes matching `/error|invalid|required|success|saved|failed|warning|alert|sent|updated/i` that are not inside a live region become a **serious violation**. Static “Required documents” revealed by a disclosure matches. Confidence is high.

**Why it matters**

RGAA 7.5 / 4.1.3 false fails; also mutates the page (#11).

**Recommended change**

Only compare text that appeared in response to a **known** invalid submit (share setup with `form-error-submit` on a cloned page). Emit `warning` unless the node is clearly a status (`role=status` missing after submit-time invalid). Drop the generic button click.

**Acceptance criteria**
- [ ] Opening a FAQ `<button>` that reveals “successfully applied last year” does not fail.
- [ ] Submit that shows “Email is invalid” outside a live region still flags.
- [ ] `kind` is `warning` unless association with the submit action is clear.

**Dependencies**
- #11.

---

### [P2] IBM: dedupe by node, not by check id; keep IBM optional

**Location**
- `packages/analysis-core/src/runtime/ibm-runtime.ts` (`shouldSkipIbmFinding` returns true if `axeIds.has(checkId)`)

**Problem**

If axe reported any `content-region` node, IBM `aria_content_in_landmark` on a **different** node is dropped. The unit test **requires** this.

**Why it matters**

Loses the only reason IBM exists (nodes axe missed). Check-id skip was a noise reduction; it overshoots.

**Recommended change**

Skip only matching snippet/selector keys (already computed as `axeSnippets`). Keep rejected-rule list. Do not add Alfa.

**Acceptance criteria**
- [ ] Axe `region` on `main` does not suppress IBM on a sibling `<a>` outside landmarks.
- [ ] Same snippet still deduped.
- [ ] Existing rejected IBM rules still emit nothing.

**Dependencies**
- #6 (shared collapse helper if possible).

---

### [P2] CLI: machine-readable findings without becoming a second product

**Location**
- `src/cli/check.ts`
- `packages/check/README.md`

**Problem**

CLI prints `FAIL checkId location — reason` and exits 1. No JSON, no analyzer field, no distinction between jsx-a11y and custom AST. Fine as a gate; weak as evidence in CI artifacts.

**Why it matters**

CI cannot attach structured evidence to PRs. Out of scope to run browsers in `complyloop-check` (AST-only is the documented contract).

**Recommended change**

Optional `--format json` of `RawFinding` (including #5 fields). Keep default human text and AST-only. Do not add html-validate to the CLI (no generated DOM).

**Acceptance criteria**
- [ ] `complyloop-check --format json .` emits parseable findings with `checkId`, `location`, `analyzerId`.
- [ ] Default output and exit codes unchanged.
- [ ] README documents AST-only and the flag.

**Dependencies**
- #5.

---

### [P2] Widget keyboard: document reachability vs operability; do not claim arrow-key coverage

**Location**
- `packages/analysis-core/src/runtime/custom-checks/widget-keyboard.ts`
- `src/adapters/rgaa/guidance.ts` (`tabs-keyboard`, `menu-keyboard`, `disclosure-keyboard`)

**Problem**

Comments say the checks are **reachability only** (tab in tab order, `aria-expanded` focusable, menuitem focusable) and that axe never tests inner widget keys. Help text still mentions “Tab and arrow keys”. Findings can pass RGAA 7.3 for tabs that are focusable but ignore arrows.

**Why it matters**

Over-claim in guidance. Adding arrow-key simulation is coverage, not a P0.

**Recommended change**

Align help/guidance with reachability. Optionally add a **separate** `needs_review` probe for arrow keys later; do not fold it into the same check id without tests.

**Acceptance criteria**
- [ ] Guidance for these check ids does not say arrow keys were tested unless they were.
- [ ] Existing reachability tests remain.

**Dependencies**
- None.

---

### [P2] `consistent-nav` / help signatures are order-sensitive strings and will false-fail personalized chrome

**Location**
- `packages/analysis-core/src/runtime/site-level/checks.ts`
- `packages/analysis-core/src/runtime/site-level/snapshot.ts`

**Problem**

Nav is compared as `label::href` joined with `>`. Logged-in vs marketing routes, extra “Admin” links, or locale prefixes fail `consistent-nav` as violations. Confidence is only `medium` but `kind` is `violation` → requirement **failed**.

**Why it matters**

Site-level is the right layer; the threshold is too strict for compliance fail.

**Recommended change**

Emit `warning` / `needs_review` unless the primary nav is missing entirely. Ignore trailing auth-only links if needed. Do not add a new crawler.

**Acceptance criteria**
- [ ] Two routes that share the same first N nav items but add “Logout” do not `failed` `consistent-nav` (warning OK).
- [ ] Completely different nav still flags.

**Dependencies**
- None.

---

## P3 — Quality

### [P3] Stop using `waitUntil: "networkidle"` as the only ready signal

**Location**
- `packages/analysis-core/src/runtime/scan.ts` (`page.goto(..., { waitUntil: "networkidle", timeout: 30_000 })`)

**Problem**

SPAs with analytics/HMR never reach network idle; the scan errors and all runtime-only controls stay `unable_to_verify`. Fast static pages may still have late client widgets unmounted.

**Why it matters**

Unreliable runtime coverage, not a new rule.

**Recommended change**

Prefer `domcontentloaded` + a short settle, or `load`, with a configurable timeout. Keep SSRF interceptors. Document that client-only routes may need an extra wait selector later (P4).

**Acceptance criteria**
- [ ] A page with a repeating fetch every 2s can still complete an audit.
- [ ] Timeout still classified via `scan-error.ts`.

**Dependencies**
- None.

---

### [P3] Do not re-inject `axe.min.js` on every `runAxeOnPage` call without a guard

**Location**
- `packages/analysis-core/src/runtime/scan.ts` (`runAxeOnPage` always `addScriptTag`)

**Problem**

Axe is injected for the main run, then again for each target-size pass, then again per theme condition. Usually harmless; extra cost and possible double-install warnings.

**Why it matters**

Performance and flakiness under theme pass (#10).

**Recommended change**

Inject once per page; subsequent runs call `axe.run` only.

**Acceptance criteria**
- [ ] Multiple `runAxeOnPage` on one page do not throw.
- [ ] Theme + target-size still produce mapped findings.

**Dependencies**
- #10 makes this more valuable.

---

### [P3] Update analyzer docs that disagree with the code

**Location**
- `docs/ai/architecture.md` (html-validate maps landmarks and form-error as if that were the contract)
- `docs/analysis-checks-challenge.md` (~17/25 custom-checks lack unit tests — most probes now have colocated tests)
- `docs/analysis-strategy.md` (theme pass / html-validate role)

**Problem**

Agents and humans will implement the **docs’** html-validate story (12.6, 11.10) and re-expand the scanner. Test-gap counts are stale.

**Why it matters**

This review’s #4 will lose to the next agent who “follows architecture.md”.

**Recommended change**

After #4/#10, rewrite those paragraphs to match code. Do not duplicate long check-id lists (authority remains `check-authority.ts`).

**Acceptance criteria**
- [ ] architecture.md: html-validate = 8.2 + 10.1 only.
- [ ] Challenge doc does not claim a large custom-check unit-test gap without recounting files.
- [ ] Theme pass described as “wired in assessment” only if #10 landed.

**Dependencies**
- #4, #10.

---

### [P3] Revisit `accessibility-checker` install cost; do not add Alfa

**Location**
- `packages/analysis-core/package.json` (`accessibility-checker`)
- `next.config.ts` (`serverExternalPackages`)
- `docs/analysis-checks-challenge.md`

**Problem**

IBM is a real sibling engine but pulls heavy optional browsers. Dynamic import already avoids bundling. Cost is ops/CI, not mapping.

**Why it matters**

Install time and image size. Adding Alfa would be a third overlapping engine.

**Recommended change**

Measure CI install impact. Consider making IBM opt-in via env. Never add Alfa alongside IBM.

**Acceptance criteria**
- [ ] Decision recorded in architecture.md: keep / opt-in / remove.
- [ ] No new equal-access engine.

**Dependencies**
- #7 (IBM must not take down axe if kept).

---

### [P3] Replace the custom HTML serializer with a tested serialization or `page.content()` for the live-DOM pass

**Location**
- `packages/analysis-core/src/runtime/html-validate-runtime.ts` (`serializeDocument`, `new Function` in the page)

**Problem**

Custom walker exists to map offsets → selectors. It skips comments, omits doctype, emits void as `<img/>`, lowercases tags (SVG/MathML risk). Offset map is the reason it exists.

**Why it matters**

Serializer bugs become fake 8.2 findings. Lower priority than role (#4) and honesty (#13).

**Recommended change**

After #4, add fixtures: SVG, template, custom elements, boolean attributes. If `page.content()` plus DOM query from line/column is accurate enough, drop the walker.

**Acceptance criteria**
- [ ] SVG + foreignObject fixture does not crash or emit nonsense `markup-nesting`.
- [ ] Offset → selector tests on nested elements remain.

**Dependencies**
- #4, #13.

---

### [P3] `sameInstance` matching is location-only; keep it scoped per control

**Location**
- `src/server/assessment-helpers.ts` (`sameInstance`)
- `src/server/assessment.ts` (open findings already filtered by `controlId`)

**Problem**

Identity is URL+selector/snippet (DOM) or path+line/snippet (source), not `checkId`. Safe today because the loop is per control and check ids are unique per automated control. Fragile if two engines emit different check ids at the same selector, or if catalog uniqueness is relaxed.

**Why it matters**

Wrong remediation merge / dismissal stickiness.

**Recommended change**

Include `checkId` in `sameInstance`. Add a test with two check ids at the same selector.

**Acceptance criteria**
- [ ] Two findings at the same DOM selector for different check ids are not merged.
- [ ] Re-assess still matches the same `img-alt` on the same `img`.

**Dependencies**
- None.

---

## P4 — Future / Research

### [P4] Visual regression screenshots as regression evidence only

**Location**
- `docs/analysis-strategy.md` (item 1 remaining)
- `packages/analysis-core/src/runtime/` (no screenshot assertion pass today)

**Problem**

Strategy lists Playwright screenshot assertions to catch CSS/layout loss no rule names. Not implemented. Easy to turn into an “AI vision scanner”.

**Why it matters**

Useful later; will drown the finding queue if it auto-fails RGAA.

**Recommended change**

When started: compare against the previous assessment’s screenshots; emit `warning` / `needs_review` on unexpected diff; never set `passed` on a criterion because pixels matched. No new vendor.

**Acceptance criteria** (when picked up)
- [ ] Diff findings are not mapped to a specific RGAA fail without a human.
- [ ] No LLM vision.

**Dependencies**
- P1 pipeline trust.

---

### [P4] Screen-reader / a11y-tree before-after for live regions

**Location**
- `live-region-updates.ts` (DOM text heuristic today)
- `docs/analysis-strategy.md` (“aria-live present is not proof”)

**Problem**

4.1.3 needs name/role/value change in the accessibility tree, not substring heuristics.

**Recommended change**

Research Playwright/CDP accessibility snapshots around a controlled action. High cost, easy false confidence. Stay P4 until #11/#21 are done.

**Dependencies**
- #11, #21.

---

### [P4] Do not add Nu HTML Checker, Lighthouse, Pa11y, WAVE, `@html-validate/wcag`, or Alfa

**Location**
- `docs/analysis-strategy.md` / `docs/analysis-checks-challenge.md` (already reject most of these)
- `packages/analysis-core/package.json`

**Problem**

Tempting when 8.2 feels incomplete. Each is another overlapping scanner.

**Recommended change**

If 8.2 still lacks evidence after #4/#13/#20, tighten html-validate input — do not add a second HTML validator.

**Dependencies**
- #20 first.

---

### [P4] Keyboard operability beyond reachability (arrow keys, focus trap completeness)

**Location**
- `widget-keyboard.ts`, `dialog-focus.ts`, `focus-trap.ts`

**Problem**

Reachability is shipped; full APG patterns are not. Strategy still lists this.

**Recommended change**

Add only with fixtures per widget and `needs_review` until false-positive rate is known.

**Dependencies**
- #23.

---

### [P4] Frameworks beyond RGAA/WCAG and sources beyond GitHub

**Location**
- `src/adapters/`, `src/core/project-types.ts` (`ProjectSource` is GitHub)

**Problem**

Product spec allows it. Analyzer TODOs above are accessibility-specific. A second framework now would freeze current over-claims into “generic” status logic.

**Recommended change**

Prove RGAA statuses are honest (#4–#9) before SOC 2/ISO adapters.

**Dependencies**
- P1.

---

## What NOT to do

These are tempting given the current code and docs, and would make the architecture worse.

1. **Do not enable `html-validate:recommended` or `@html-validate/wcag`.** The package is already on a curated list. Expanding it duplicates axe and jsx-a11y (labels, headings, ARIA).
2. **Do not keep html-validate mappings to `landmark-one-main`, `landmark-unique`, or `form-error-association`.** That is scanner sprawl. Axe/IBM/custom already own those facts on the rendered DOM.
3. **Do not run html-validate on TSX source or inside `complyloop-check`.** RGAA 8.2/10.1 are generated-document criteria; the CLI is AST-only by design.
4. **Do not add Lighthouse, Pa11y, WAVE, Tenon, `jest-axe`, or `@axe-core/playwright`.** Same class as axe; `@axe-core/playwright` is explicitly rejected (webpack/`module` rewrite).
5. **Do not add Alfa while IBM Equal Access is present.** Two IBM-family engines on one page.
6. **Do not add a custom AST twin for facts jsx-a11y or axe already report** (`package-twin` list in `check-authority.ts` exists because this happened before).
7. **Do not treat an empty runtime-only scan as `passed` for CAPTCHA, media, hover, or layout tables** (#9). Silence is not evidence.
8. **Do not mark a requirement `passed` because an AI explanation is confident.** Statuses stay deterministic or human (`product-context` / AI rules).
9. **Do not replace human pertinence twins** (`src/adapters/rgaa/pertinence-twins.ts`) with alt-text quality models.
10. **Do not auto-pass RGAA 8.2 from “React compiled” or from jsx-a11y cleanliness.** 8.2 is html-validate (narrow) + honesty about live-DOM repair.
11. **Do not re-introduce cross-route id uniqueness as 8.2.** If composition duplicates ids, check **one document** after compose.
12. **Do not combinatorially re-run every check under every viewport × theme × state.** Theme pass is a small contrast/focus subset for a reason.
13. **Do not use visual diffs or screenshots as an RGAA fail** without a human (#31).
14. **Do not collapse five analyzers into five findings for one missing label.** Dedup toward one finding with multi-analyzer evidence (#5–#6), not more tickets.

---

## Check inventory (for implementers)

Use this when touching mappings. Not every row needs a TODO.

| Check id | Engines that can emit it | Authority | Notes |
| --- | --- | --- | --- |
| `markup-nesting` | html-validate only | runtime_only | 8.2 owner |
| `css-for-presentation` | html-validate | runtime_only | 10.1 owner |
| `duplicate-id` | AST, axe | composition_sensitive | Per-document; axe owns rendered DOM |
| `landmark-one-main` / `landmark-unique` | axe, IBM | runtime_only | html-validate does not emit |
| `form-error-association` | AST, axe, IBM, form-error-submit | composition_sensitive | html-validate does not emit; help text #12 |
| `img-alt` | AST/jsx-a11y, axe (many rules collapsed) | package-twin source | Many axe rules → one control (intentional) |
| `hover-content` | Playwright; listed heuristic **and** runtime_only → runtime_only | Over-pass (#9, #14) |
| `reduced-motion` | Playwright; heuristic only | Correct: empty ≠ pass |
| `captcha-alternative` | AST heuristic + Playwright | runtime_only | Over-pass (#9) |
| `resize-text` | Playwright | runtime_only | Mixed with 1.4.10 (#10) |
| `color-contrast` | axe; theme pass unused | runtime_only | #10 |
| `broken-link` | linkinator | runtime_only | OK |
| `consistent-lang` | site-level | site_level | Warning/review; not 8.4 fail |
| `focus-appearance` | Playwright | runtime_only | WCAG 2.4.13 AAA; excluded from Full RGAA preset |

Package-twin source ids (dropped when runtime ran): `img-alt`, `list-structure`, `audio-caption`, `video-caption`, `no-blink-marquee`, `meta-viewport`, `aria-props`, `aria-role`, `aria-required-attr`, `aria-activedescendant`, `keyboard-interaction`, `html-lang`, `iframe-title`, `autocomplete-valid`, `no-accesskey`, `no-autofocus`, `noninteractive-tabindex`, `redundant-role`, `th-scope`, `positive-tabindex`.

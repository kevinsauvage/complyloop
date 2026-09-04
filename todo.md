# ComplyLoop Implementation TODO

## Executive Summary

ComplyLoop already has a real multi-engine accessibility pipeline: custom AST checks + `eslint-plugin-jsx-a11y` on TSX, Playwright + axe-core on preview URLs, a curated `html-validate` pass on the serialized live DOM, IBM Equal Access as a sibling engine, Playwright behaviour probes, theme/target-size condition passes, and site-level + linkinator checks. Findings merge into catalog controls with authority classes (`runtime_only`, `composition_sensitive`, `heuristic`, `site_level`). AI never sets status.

The analyzer is **not yet trustworthy enough to treat a green requirement as compliance evidence** for every runtime-only control, but the three P0 defects that emitted or suppressed wrong RGAA status are **fixed** (see Completed below).

`html-validate` is scoped to **RGAA 8.2 and 10.1 structural evidence only** on the generated DOM. Runtime observations now carry optional `analyzerId` / `analyzerRuleId` (axe, html-validate, IBM, playwright-custom, site-level, linkinator); same check + dom node is deduped per page with contributing analyzers preserved. Coarse `engine: "ast" | "runtime"` remains for remediation routing.

Do not add another scanner. Next: restore page state after mutating probes, fix `resize-text` viewport semantics, and tighten html-validate evidence copy for live-DOM serialization limits.

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
  Playwright page.goto (domcontentloaded + brief settle)
         ├─ axe-core (disk axe.min.js)
         ├─ custom Playwright probes (complyloop-* ids mapped in axe-map.ts)
         ├─ html-validate on custom-serialized live DOM
         ├─ page snapshot (site-level)
         ├─ axe target-size at default, 320×568, pointer: coarse
         ├─ IBM Equal Access (dedupe vs axe by same node snippet)
         └─ theme-sensitive re-run (dark + light from assessment by default)
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

**Status derivation** (`deriveRequirementStatus`): sticky human decisions win; open `violation` → `failed`; open `warning` → `needs_review`; runtime applicability observations → `not_applicable` when all pages confirm absence; else authority gate. Applicability-gated ids without confirmation stay `unable_to_verify`.

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
| P1 | 4 | page restore after probes, resize-text, evidence honesty, remaining regression tests |
| P2 | 6 | probe quality, SSR HTML capture, CLI evidence |
| P3 | 3 | `networkidle` ready signal, IBM install weight, serializer cleanup |
| P4 | 5 | Visual regression, SR automation, extra engines — do not start |

## Recommended Execution Order

1. **Page restore (#11)** — reload or clone page after form-error / live-region / hover probes.
2. **`resize-text` (#12)** — 200% at default viewport; leave 320×568 to `reflow`.
3. **html-validate evidence honesty (#13)** — live-DOM serialization limits in finding/evidence copy.
4. **Remaining regression tests (#14)** — engine throw isolation, assessment `browserConditions`, probe restore.
5. **P2+** — applicability observations, probe false positives, SSR HTML capture — only after P1 stops lying.

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

### P1 — Engine isolation (IBM / html-validate failures non-fatal)

- `scan.ts`: per-page try/catch around html-validate and IBM; axe + custom findings kept on engine failure.
- `RuntimeScanPageResult`: `htmlValidateRan` / `ibmCheckerRan` per page; aggregated in `scanRuntime`.

### P1 — Gate 8.2 / 10.1 on htmlValidateRan

- `requirement-status.ts`: `markup-nesting` and `css-for-presentation` stay `unable_to_verify` unless `htmlValidateRan`.
- `assessment-status.ts` / `assessment.ts`: pass `htmlValidateRan` into status refresh.

### P1 — Applicability-gated checks + copy fixes

- `check-authority.ts`: CAPTCHA, hover, media, layout-table, live-region → heuristic (empty probe ≠ pass).
- `form-error-submit.ts`: help cites RGAA 11.10 (not 11.11).
- `hover-content.ts`: removed `[aria-describedby]` from trigger list.

### P1 — Theme condition pass wired into assessments

- `theme-conditions.ts`: `DEFAULT_THEME_CONDITIONS` (`dark`, `light`).
- `assessment.ts`: passes `browserConditions` into `scanRuntime`; records `themeConditions` on `AssessmentEngines`.

### P1 — Regression tests (partial)

- `html-validate-runtime.test.ts`: map ⊆ {`markup-nesting`, `css-for-presentation`}; landmarks / duplicate-id / form-error not emitted.
- `requirement-status.test.ts`: 8.2/10.1 gated on `htmlValidateRan`.
- `check-authority.test.ts`: applicability-gated ids (CAPTCHA, hover, media) are heuristic — empty ≠ pass.
- `scan-runtime-flags.test.ts`: aggregates `htmlValidateRan` / `ibmCheckerRan` across pages.
- `hover-content.test.ts`: `[aria-describedby]` no longer treated as hover trigger.
- `assessment-status.test.ts`: status refresh respects `htmlValidateRan`.

**Still open:** engine throw preserves axe findings; assessment asserts `browserConditions`; probe page-restore (see P1 #14).

### P2 — IBM dedupe by node snippet (not check id)

- `ibm-runtime.ts`: `shouldSkipIbmFinding` skips only when axe already reported the **same** `checkId::snippet` key — not any hit of the check id on the page.
- `runtime/dedupe-runtime-findings.ts`: post-hoc collapse for IBM vs axe same-node overlap (axe wins).

### P3 — Runtime navigation + single axe inject

- `scan.ts`: `gotoForRuntimeAudit` uses `domcontentloaded` + 250ms settle instead of `networkidle`.
- `scan.ts`: `runAxeOnPage` injects `axe.min.js` once per page (`WeakSet` guard).
- `scan.test.ts`: repeating-fetch goto completes; multiple axe runs on one page do not throw.

### P3 — Analyzer docs aligned with code

- `docs/ai/architecture.md`: runtime goto strategy, per-page axe inject, IBM node-level dedupe, theme pass default.
- `docs/analysis-checks-challenge.md`: theme pass wired; IBM same-node skip; custom-check tests 26/26 colocated; navigation row.
- `docs/analysis-strategy.md`: `DEFAULT_THEME_CONDITIONS` documented for assessments.

### P2 — First-class applicability observations (media, CAPTCHA, tables)

- `runtime/applicability.ts`: deterministic DOM absence probes per page; site-wide aggregation when every page confirms absence.
- Observable check ids: `video-caption`, `audio-caption`, `media-keyboard`, `media-identification`, `captcha-alternative`, `layout-table-linearization`.
- `requirement-status.ts`: `applicabilityConfirmed` → `not_applicable` (after open-finding precedence).
- `scan.ts` / `assessment.ts` / `assessment-status.ts`: observations flow through runtime scan into status refresh with evidence fact.

---

## Analyzer coverage matrix

| Layer | Engine | Input | Current role | RGAA/WCAG | Status |
| --- | --- | --- | --- | --- | --- |
| Source | Custom AST (`checks/`, 58) | TSX/JSX | React patterns jsx-a11y cannot see; CI gate | Many (CAPTCHA cues, office docs, heuristics, …) | Active. Applicability-gated ids → heuristic at status time. |
| Source | `eslint-plugin-jsx-a11y` (28 mapped rules) | TSX | CI source twin | img-alt, names, ARIA, keyboard heuristics | Active. `control-has-associated-label` is intentionally off. |
| Rendered DOM | axe-core (~123 mapped rules) | Live page via `axe.min.js` (once per page) | Baseline a11y tree | Broad WCAG; mapped through `axe-map.ts` | Active. Incomplete nodes → `warning` / `needs_review`. |
| Rendered HTML | html-validate (7 curated rules) | Custom-serialized `document.documentElement` | RGAA 8.2 markup + 10.1 presentation only | 8.2 (`markup-nesting`), 10.1 (`css-for-presentation`) | Active. Not used by CLI. Duplicate ids: axe runtime + AST. |
| Rendered DOM | IBM Equal Access (15 curated rules) | Same Playwright page after axe | Sibling engine; skip when axe already reported same node | Landmarks, lists, form errors, skip link, … | Active. Node-level skip (not check-id blanket). Per-page failure is non-fatal. |
| Runtime | Playwright custom (~26 probes) | Browser (tab, emulateMedia, viewport) | Behaviour axe cannot see | Focus, reflow, widgets, hover, live regions, 44×44, forced-colors, reduced-motion, … | Active. css-off restore fixed; submit/hover probes still mutate page (P1 #11). |
| Runtime conditions | Theme pass (`theme-conditions.ts`) | dark / light / `prefers-contrast: more` | Re-run contrast/focus under theme | 1.4.3 / 1.4.6 / 1.4.11 | Active — assessments pass `dark` + `light` by default. |
| Runtime conditions | Viewport / pointer (`viewport-conditions.ts`) | default, `320×568`, `pointer: coarse` | axe `target-size` 24×24 | 2.5.8 / RGAA target size | Active. |
| Site | `site-level/checks.ts` | Snapshots across ≥2 routes | Nav/help/title/landmark consistency | 12.x, 8.6, 9.1 | Active. Cross-route `duplicate-id` removed; `consistent-lang` is warning/review (not 8.4 fail). |
| Site | linkinator (`link-check.ts`) | Same-origin URLs + fragment ids | Broken links | RGAA 6.2 (`broken-link`) | Active. SSRF-guarded. |
| Human | Manual catalog (`checkId: null`, 26) | Rendered UI | Pertinence, quality, flash, AT media | 1.3, 1.4, 3.1, 4.13, … | Correct: stays `unable_to_verify` until human pass/exception. |

**Catalog:** 156 RGAA/WCAG controls in `src/adapters/rgaa/controls.ts`; 130 automated (`checkId` set), 26 manual. Full RGAA preset includes only controls whose `code` starts with `RGAA` (WCAG-only AAA extras such as 2.4.13 stay out of RGAA assessments).

---

## P1 — Core correctness

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

### [P1] html-validate 8.2 evidence must describe what was actually validated (repaired live DOM)

**Location**
- `packages/analysis-core/src/runtime/html-validate-runtime.ts` (`serializeDocument` walks the **live** tree, skips comments, omits doctype, starts at `document.documentElement`)
- `packages/analysis-core/src/contract/finding-types.ts` (`EvidenceRecord.detail`)

**Problem**

RGAA 8.2 is validity of **generated** HTML. The pass serializes the post-parse DOM with a custom walker, then validates that string. Browser (or SSR parser) repair of illegal nesting never appears. Architecture already notes interactive nesting is repaired and left to axe — the same limitation applies to `p > div`, implied `</p>`, etc. A clean result is “no issues in this serialization”, not “the HTTP/SSR source is valid HTML5”.

`elementAtOffset` maps line/column to the last element whose start offset is `<=` the message offset — closing-tag messages can attach to the wrong node. Confidence is always `high`.

**Why it matters**

`passed` 8.2 after the html-validate scope fix would over-state what was proved. Findings with selector `(document)` or a sibling element are weak evidence.

**Recommended change**

Record in evidence: input kind (`live-dom-serialization`), html-validate version, rule ids enabled, whether doctype was included. Lower confidence or keep 8.2 at `needs_review` for SSR-heavy apps until a document-response capture exists (#20). Fix offset mapping tests for errors on closing tags. Optional later: validate `page.content()` or the navigation response body **in addition**, still mapped only to 8.2/10.1, deduped (#6).

**Acceptance criteria**
- [ ] `finding_detected` / assessment evidence for markup-nesting includes analyzer + “live DOM serialization” (or equivalent).
- [ ] Unit test: message on a closing tag maps to that element, not an unrelated later sibling.
- [ ] Docs state the repair limitation; UI reason does not say “source HTML is valid” unless response HTML was checked.

**Dependencies**
- html-validate scope + `htmlValidateRan` gate (landed 2026-09-04). SSR response capture (#20) is follow-up, not a blocker for honest evidence.

---

### [P1] Lock P0/P1 behaviour with tests that currently encode the bugs or omit them

**Location**
- `packages/analysis-core/src/runtime/custom-checks/index.test.ts` (mocks; does not test execution order vs mutation)
- `packages/analysis-core/src/runtime/scan.ts` (engine isolation — no throw test yet)
- `src/server/assessment.test.ts` (no `browserConditions` assertion)

**Problem**

Most map/status/applicability tests landed with the 2026-09-04 P1 batch. Gaps remain: no test that html-validate or IBM throw preserves axe findings; no assessment test that theme conditions are requested; no Playwright test that mutating probes restore page state (#11).

**Why it matters**

Without the remaining tests, #11–#13 will regress.

**Recommended change**

Add tests as acceptance criteria of #11–#13 land. Prefer Playwright page tests for mutation/restore; unit tests for scan error paths.

**Acceptance criteria**
- [x] `npm run test` covers: html-validate map ⊆ {markup-nesting, css-for-presentation}.
- [x] 8.2 gated on `htmlValidateRan`.
- [x] No auto-pass CAPTCHA / hover / media on empty runtime scan.
- [ ] html-validate or IBM throw on one page still returns axe + custom findings from that page.
- [ ] Assessment test: `scanRuntime` receives `browserConditions` when runtime is configured.
- [ ] Each remaining P1 item (#11–#13) has a test that would catch regression.

**Dependencies**
- Lands with #11–#13, not as a vague “add more tests” leftover.

---

## P2 — Coverage

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

### [P2] CLI: machine-readable findings without becoming a second product

**Location**
- `src/cli/check.ts`
- `packages/check/README.md`

**Problem**

CLI prints `FAIL checkId location — reason` and exits 1. No JSON, no analyzer field, no distinction between jsx-a11y and custom AST. Fine as a gate; weak as evidence in CI artifacts.

**Why it matters**

CI cannot attach structured evidence to PRs. Out of scope to run browsers in `complyloop-check` (AST-only is the documented contract).

**Recommended change**

Optional `--format json` of `RawFinding` (including analyzer identity fields). Keep default human text and AST-only. Do not add html-validate to the CLI (no generated DOM).

**Acceptance criteria**
- [ ] `complyloop-check --format json .` emits parseable findings with `checkId`, `location`, `analyzerId`.
- [ ] Default output and exit codes unchanged.
- [ ] README documents AST-only and the flag.

**Dependencies**
- Analyzer identity on findings (landed 2026-09-04).

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
- #7 (IBM per-page failure is non-fatal as of 2026-09-04).

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

Prove RGAA statuses are honest (remaining P1) before SOC 2/ISO adapters.

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
7. **Do not treat an empty runtime-only scan as `passed` for CAPTCHA, media, hover, or layout tables.** Applicability-gated ids are heuristic — empty → `unable_to_verify` (fixed 2026-09-04).
8. **Do not mark a requirement `passed` because an AI explanation is confident.** Statuses stay deterministic or human (`product-context` / AI rules).
9. **Do not replace human pertinence twins** (`src/adapters/rgaa/pertinence-twins.ts`) with alt-text quality models.
10. **Do not auto-pass RGAA 8.2 from “React compiled” or from jsx-a11y cleanliness.** 8.2 is html-validate (narrow) + honesty about live-DOM repair.
11. **Do not re-introduce cross-route id uniqueness as 8.2.** If composition duplicates ids, check **one document** after compose.
12. **Do not combinatorially re-run every check under every viewport × theme × state.** Theme pass is a small contrast/focus subset for a reason.
13. **Do not use visual diffs or screenshots as an RGAA fail** without a human (#31).
14. **Do not collapse five analyzers into five findings for one missing label.** Dedup toward one finding with multi-analyzer evidence (analyzer identity + runtime dedupe — landed 2026-09-04), not more tickets.

---

## Check inventory (for implementers)

Use this when touching mappings. Not every row needs a TODO.

| Check id | Engines that can emit it | Authority | Notes |
| --- | --- | --- | --- |
| `markup-nesting` | html-validate only | runtime_only | 8.2 owner |
| `css-for-presentation` | html-validate | runtime_only | 10.1 owner |
| `duplicate-id` | AST, axe | composition_sensitive | Per-document; axe owns rendered DOM |
| `landmark-one-main` / `landmark-unique` | axe, IBM | runtime_only | html-validate does not emit |
| `form-error-association` | AST, axe, IBM, form-error-submit | composition_sensitive | html-validate does not emit; help cites RGAA 11.10 |
| `img-alt` | AST/jsx-a11y, axe (many rules collapsed) | package-twin source | Many axe rules → one control (intentional) |
| `hover-content` | Playwright | heuristic | Empty probe → `unable_to_verify` |
| `reduced-motion` | Playwright | heuristic | Correct: empty ≠ pass |
| `captcha-alternative` | AST heuristic + Playwright | heuristic | Empty probe → `unable_to_verify` |
| `resize-text` | Playwright | runtime_only | Wrong viewport — use default for 200% (#12) |
| `color-contrast` | axe; theme pass (dark + light) | runtime_only | Theme pass wired in assessment |
| `broken-link` | linkinator | runtime_only | OK |
| `consistent-lang` | site-level | site_level | Warning/review; not 8.4 fail |
| `focus-appearance` | Playwright | runtime_only | WCAG 2.4.13 AAA; excluded from Full RGAA preset |

Package-twin source ids (dropped when runtime ran): `img-alt`, `list-structure`, `audio-caption`, `video-caption`, `no-blink-marquee`, `meta-viewport`, `aria-props`, `aria-role`, `aria-required-attr`, `aria-activedescendant`, `keyboard-interaction`, `html-lang`, `iframe-title`, `autocomplete-valid`, `no-accesskey`, `no-autofocus`, `noninteractive-tabindex`, `redundant-role`, `th-scope`, `positive-tabindex`.

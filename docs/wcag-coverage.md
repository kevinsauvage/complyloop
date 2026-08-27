# WCAG / RGAA Coverage Analysis — ComplyLoop MVP

> Goal: maximize RGAA v4 / WCAG 2.1 (A + AA) coverage with the existing
> deterministic engine (TS AST checks + Playwright/axe-core runtime audit).
> Source of truth: `src/adapters/rgaa/controls.ts`, `src/analysis/checks/`,
> `src/analysis/runtime/axe-map.ts`, `axe-core@4.13.0` (105 rules).
> Last generated: 2026-08-24.

## How coverage works today

| Layer | What it is | Count |
|-------|-----------|-------|
| **Controls** (reported) | First-class requirements with a status, shown on the Requirements page | **27** |
| **AST checks** (source) | Deterministic TS-AST checks, run in CI and locally (`@complyloop/check`) | **21** |
| **Runtime-only checks** | Need a rendered page (axe-core on `runtimeBaseUrl`) | **6** |
| **Mapped axe rules** | axe-core rules that resolve to a `checkId` via `axe-map.ts` | **~60** |

Key nuance: `axe-map.ts` only *statuses controls we model* — an axe rule not in
`AXE_TO_CHECK` is ignored. So "axe covers it" ≠ "it's enforced" unless the rule
is mapped **and** the `checkId` backs a `Control`. A control with no check (e.g.
custom controls) stays `unable_to_verify` until a human decision.

So the real gap has two dimensions:
1. **No modeled `Control`** → the criterion is never reported as a requirement.
2. **No mapped/implemented check** → even if modeled, it can't be auto-verified.

## Currently modeled controls (27) → WCAG criteria

| Control | WCAG | RGAA | Check kind |
|---------|------|------|-----------|
| ctl-img-alt | 1.1.1 | 1.1 | AST + runtime (image-alt, area-alt, object-alt, svg-img-alt, role-img-alt, input-image-alt) |
| ctl-button-name | 4.1.2 | 11.9 | AST + runtime (button-name, input-button-name, aria-command-name, aria-tooltip-name) |
| ctl-link-name | 2.4.4 | 6.1 | AST + runtime (link-name) |
| ctl-html-lang | 3.1.1 | 8.3 | AST + runtime (html-has-lang, html-lang-valid, html-xml-lang-mismatch) |
| ctl-focus-order | 2.4.3 | 12.8 | AST (positive-tabindex) |
| ctl-input-label | 3.3.2 | 11.1 | AST + runtime (label, select-name, form-field-multiple-labels, aria-input-field-name, aria-toggle-field-name, aria-meter-name, aria-progressbar-name) |
| ctl-heading-order | 1.3.1 | 9.1 | AST + runtime (heading-order, page-has-heading-one) |
| ctl-empty-heading | 1.3.1 | 9.2 | AST + runtime (empty-heading) |
| ctl-iframe-title | 4.1.2 | 2.1 | AST + runtime (frame-title, frame-title-unique) |
| ctl-autoplay-media | 1.4.2 | 4.1 | AST + runtime (no-autoplay-audio) |
| ctl-duplicate-id | 4.1.1 | 8.2 | AST + runtime (duplicate-id, duplicate-id-aria) |
| ctl-form-error-association | 3.3.1 | 11.10 | AST |
| ctl-aria-hidden-focusable | 4.1.2 | 8.9 | AST + runtime (aria-hidden-focus, aria-hidden-body) |
| ctl-aria-role | 4.1.2 | 7.1 | AST + runtime (aria-roles, aria-deprecated-role) |
| ctl-aria-props | 4.1.2 | 7.1 | AST + runtime (aria-allowed-attr, aria-valid-attr, aria-valid-attr-value, aria-prohibited-attr, aria-unsupported-elements, aria-braille-equivalent) |
| ctl-aria-required-attr | 4.1.2 | 7.1 | AST + runtime (aria-required-attr, aria-required-children, aria-required-parent, aria-conditional-attr) |
| ctl-no-autofocus | 2.4.3 | 12.7 | AST |
| ctl-keyboard-interaction | 2.1.1 | 12.11 | AST |
| ctl-color-contrast | 1.4.3 | 3.2 | runtime (color-contrast, color-contrast-enhanced, link-in-text-block) |
| ctl-document-title | 2.4.2 | 8.5 | runtime (document-title) |
| ctl-bypass | 2.4.1 | 12.7 | runtime (bypass, skip-link) |
| ctl-landmark-one-main | 1.3.1 | 12.6 | runtime (landmark-one-main, landmark-main-is-top-level, landmark-no-duplicate-main) |
| ctl-nested-interactive | 4.1.2 | 8.9 | runtime (nested-interactive) |
| ctl-target-size | 2.5.8 | 11.11 | runtime (target-size) |
| ctl-meta-viewport | 1.4.4 | 10.4 | AST + runtime (meta-viewport, meta-viewport-large) |
| ctl-list-structure | 1.3.1 | 9.3 | AST + runtime (list, listitem, definition-list, dlitem) |
| ctl-autocomplete-valid | 1.3.5 | 11.13 | AST + runtime (autocomplete-valid) |

**16 distinct WCAG 2.1 success criteria are first-class modeled controls.**

## Gap analysis — WCAG 2.1 A + AA criteria with NO modeled control

Classified by effort. "axe" = already detected by a mapped axe rule (cheap to
promote to a control); "AST" = detectable from source; "runtime" = needs a
rendered page and new logic (axe has no rule); "scope" = out of MVP (time-based
media / legal-financial flows).

### A. Cheap wins — promote an already-mapped axe rule to a Control (no engine code)

| WCAG | RGAA | Criterion | axe rule(s) already mapped | New control id |
|------|------|-----------|---------------------------|----------------|
| 1.3.1 | 9.3 | Tables: data cells have headers | `td-has-header`, `th-has-data-cells`, `td-headers-attr`, `table-fake-caption` | `ctl-table-headers` |
| 2.4.6 | 9.2 / 11.1 | Headings and labels are descriptive | `page-has-heading-one`, `region` | `ctl-page-heading` / `ctl-content-region` |
| 2.5.3 | 6.1 | Label in name (visible label ⊂ accessible name) | `label-content-name-mismatch` | `ctl-label-in-name` |
| 3.1.2 | 8.8 | Language of parts | `valid-lang` | `ctl-lang-parts` |
| 4.1.2 | 7.1 | `aria-roledescription` valid | `aria-roledescription` | `ctl-aria-roledescription` |
| 4.1.2 | 7.1 | Presentation role conflicts | `presentation-role-conflict` | `ctl-presentation-role` |
| 2.2.1 | 13.2 | Timing adjustable (no auto-redirect/refresh) | `meta-refresh`, `meta-refresh-no-exceptions` | `ctl-no-auto-refresh` |

> These are essentially free: add a `Control` row + one `AXE_TO_CHECK` entry.
> Each adds RGAA criteria we already detect but don't report.

### B. AST-only checks worth adding (source-analyzable, CI-friendly)

| WCAG | RGAA | Criterion | Why AST works | Proposed control |
|------|------|-----------|---------------|------------------|
| 1.3.3 | 10.3 | Sensory characteristics (don't rely on shape/position alone) | Detect instructional text ("red button", "left column") near controls | `ctl-sensory-char` (heuristic, low confidence) |
| 1.4.5 | 10.1 | Images of text | Flag CSS `background-image` / `role=img` with long text content | `ctl-image-of-text` |
| 2.5.1 | 11.6 | Pointer gestures | Element has `onTouchStart`/`onPan` but no keyboard/click equivalent | `ctl-pointer-gesture` |
| 2.5.2 | 11.7 | Pointer cancellation | `onClick` without `onPointerUp`/abort path on custom widget | `ctl-pointer-cancel` |
| 2.5.4 | 11.8 | Motion actuation | `deviceorientation`/`deviceorientation` handlers | `ctl-motion-actuation` |
| 3.2.1 | 10.9 | On focus (no context change) | `onFocus` handler that navigates/submits | `ctl-focus-context-change` (heuristic) |
| 3.2.2 | 10.10 | On input (no context change) | `onChange`/`onInput` that navigates/submits without warning | `ctl-input-context-change` (heuristic) |
| 3.3.3 | 11.12 | Error suggestion | Inline error text present but lacks corrective hint | `ctl-error-suggestion` (heuristic) |

> Heuristic AST checks should set `confidence: "low"` and lean on the AI
> explainer; they should NOT auto-fail without human confirmation where risky.

### C. Runtime checks to add (rendered page, axe has no rule)

| WCAG | RGAA | Criterion | How to implement | Notes |
|------|------|-----------|------------------|-------|
| 1.4.10 | 10.5 | Reflow (no 2-D scroll at 320 CSS px) | Playwright: set viewport 320×256, assert `document.documentElement.scrollWidth <= 320` | Pure Playwright, no axe |
| 1.4.11 | 10.7 | Non-text contrast (UI components ≥ 3:1) | Compute border/icon contrast from computed styles | axe-core does NOT cover this; bespoke |
| 1.4.12 | 10.8 | Text spacing (no loss on 200%/150%/1.5×/0.16×) | Inject spacing CSS, assert no clipping/overflow | Pure Playwright |
| 1.4.13 | 10.13 | Content on hover/focus is dismissable/persistent | Hover content: check Esc-dismiss + hover-persist | Playwright interaction |
| 2.1.2 | 7.3 | No keyboard trap | Detect focus locked in modal w/o escape/close | Heuristic |
| 2.4.7 | 10.12 | Focus visible | Assert `:focus-visible` style differs from resting | Check computed outline/box-shadow |
| 2.5.6 | 11.9 | Concurrent input mechanisms | Detect exclusive pointer/keyboard gating | Rare in React apps |
| 2.5.7 | 11.10 | Dragging movements | Element supports click-to-act alt for drag | Heuristic |
| 4.1.3 | 12.x | Status messages (aria-live) | Detect `aria-live` regions receive updates without focus move | Important for SPAs |

### D. Out of MVP scope (flag, don't implement yet)

| WCAG | RGAA | Criterion | Reason |
|------|------|-----------|-------|
| 1.2.1–1.2.3 | 4.2–4.9 | Captions / audio description / alternatives | Time-based media; needs transcript pipelines |
| 1.4.6–1.4.9 | 3.x | Contrast (enhanced) / images of text (no exception) | AAA |
| 2.2.1 | 13.2 | Timing adjustable | Partial: auto-refresh covered (see quick wins); JS timers need app cooperation |
| 2.2.2 | 4.10 / 13.4 | Pause/stop/hide for auto-updating | Needs app cooperation |
| 2.3.1 | 13.8 | Three flashes | Video analysis; rarely static-code checkable |
| 3.3.4 | 11.14 | Error prevention (legal/financial) | Process-level, not per-control |
| 2.4.5 | 12.5 | Multiple ways to locate | Nav/IA concern, not a single check |
| 1.4.7–1.4.9 | 3.x | Low/no audio | AAA |

## Recommended implementation order

1. **Quick wins (A)** — promote the 6 already-mapped axe rules to controls.
   ~½ day, pure data: `controls.ts` + `axe-map.ts`. Immediately lifts reported
   RGAA coverage from 16 → 22 criteria with zero new engine logic.
2. **Runtime checks (C), highest-value first**: `1.4.10 Reflow`,
   `1.4.12 Text Spacing`, `2.4.7 Focus Visible`, `4.1.3 Status Messages`.
   Each is a small Playwright routine in `src/analysis/runtime/` + a new
   `CheckId` + control. No axe dependency.
3. **AST heuristics (B)**: add the low-risk ones (`2.5.1`, `2.5.2`,
   `2.5.4`, `3.3.3`) as new files under `src/analysis/checks/` following the
   existing `CheckId`/`Finding` contract; mark confidence low.
4. **Defer (D)** to a post-MVP "media & advanced" adapter.

## Concrete next steps (mechanics)

- New control: add a `Control` to `rgaaControls` in `controls.ts` with
  `code` (WCAG), `secondaryCode` (RGAA), `checkId` (new `CheckId`).
- New AST check: create `src/analysis/checks/<id>.ts`, register in
  `src/analysis/checks/registry.ts`, add `CheckId` to `src/analysis/types.ts`.
- New runtime check: add a `<id>` entry to `AXE_TO_CHECK` (if axe-backed) or a
  Playwright routine in `src/analysis/runtime/scan.ts` + `AXE_TO_CHECK` mapping.
- Keep `complianceWeight` aligned with current scale (1.1–1.5).
- Re-run `npm run test:coverage` — the product-surface gate must hold.

## Coverage ceiling

axe-core 4.13 already tags **67 RGAA v4 rules** and **75 WCAG rules**. Mapping
all of them to controls (step A + filling C/B) gets us to essentially the full
WCAG 2.1 A + AA surface that is statically or DOM-analyzable — the only
residual gaps are the time-based-media and process-level criteria in (D),
which are inherently out of scope for a source/CI accessibility gate.

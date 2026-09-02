# Accessibility analysis strategy

How ComplyLoop finds accessibility issues, what each engine covers, and where
the remaining gaps are. This is the analysis behind the "what else can we
test?" question — the answer to which was not "another axe wrapper", but a set
of adjacent layers.

## The headline

We already run **three complementary analysis engines**, not just axe. Adding
another a11y "engine" (Lighthouse, Pa11y, WAVE, Tenon, `jest-axe`) adds little:
most are axe underneath or heavily overlap our custom checks. The compounding
wins are in **emulation, rendering, and human verification** — layers none of
those engines touch.

## Current engines (`packages/analysis-core/src/`)

| Engine                                              | Path             | Scope                                                                 |
| --------------------------------------------------- | ---------------- | --------------------------------------------------------------------- |
| **axe-core** (from `axe.min.js` on disk)            | `runtime/scan.ts` | ~122 rule → check-id mappings (`runtime/axe-map.ts`), rendered DOM     |
| **21 custom Playwright checks**                     | `runtime/custom-checks/` | reflow, focus, hover, contrast, media, error-prevention, CAPTCHA, … |
| **78 AST checks** (source heuristics FR/EN/ES/DE)   | `checks/`        | runs in CI, dev, and `complyloop-check` without a browser             |
| **Site-level checks** (cross-route consistency)     | `runtime/site-level/` | nav, help, titles — needs ≥ 2 preview routes                       |

## What not to add (and why)

| Tool          | Verdict                                                                  |
| ------------- | ------------------------------------------------------------------------ |
| Lighthouse a11y | **Skip** — its accessibility audits run axe under the hood.           |
| Pa11y         | **Skip** — ancestor of axe, same class of static checks.                |
| WAVE / Tenon  | **Marginal** — heavy overlap; Tenon is paid.                            |
| `vitest-axe` / `jest-axe` | **Skip as primary** — same engine; only worthwhile for fast unit feedback (our AST checks already cover that). |
| `@axe-core/playwright` | **Skip** — webpack breaks on axe's `source` string (documented in `architecture.md`); we inject `axe.min.js` from disk instead. |

## Where the real coverage gaps are (by value/effort)

1. **Assistive-tech emulation via Playwright** (we own the tool, not the
   checks). Forced-colors (Windows High Contrast), `prefers-reduced-motion`,
   dark/light scheme, 200% zoom, small viewports. Axe inspects the a11y tree in
   one default render; most issues only appear under a condition. **Implemented
   in `custom-checks/` as part of this doc.**
2. **Visual / rendering regression.** Axe never looks at pixels: clipped text,
   overflow, content that renders offscreen all pass. Use Playwright's built-in
   screenshot comparison (`toMatchSnapshot`, zero deps) or Chromatic/Percy for a
   hosted review loop.
3. **`html-validate` (npm).** Structural HTML semantics on the **source**
   (invalid nesting, deprecated attributes, landmark misuse) — a different axis
   from axe's rendered DOM. Drops into CI cheaply and complements our AST checks.
4. **Screen-reader verification — the biggest gap, and it cannot be automated.**
   No package reliably asserts "what NVDA/VoiceOver actually says." The fit is
   natural: we already have a first-class **human-review stage**
   (`unable_to_verify` until a human passes). A guided SR / zoom / keyboard
   checklist wired to that stage is the highest-leverage expansion and sits
   directly on the Finding → Remediation → Evidence loop.
5. **Interaction realism.** Axe is largely static. Running real flows that
   trigger form errors and asserting the error is *announced* (aria-live)
   catches announcement bugs our `error-prevention.ts` heuristic only partially
   covers.

## Implemented so far

- **Document** — this file.
- **`custom-checks/forced-colors.ts`** (`complyloop-forced-colors`) — flags an
  interactive control whose *only* presence is a `box-shadow` or
  `background-image` (kept by Chromium in normal render but both are stripped by
  forced-colors mode), with no border, outline, text, or filled background to
  fall back on, so it renders invisible in Windows High Contrast. Detection is
  a spec-grounded style heuristic (not live emulation — Chromium already reports
  `box-shadow` as `none` under simulated forced-colors, so the authored style is
  read instead). Maps to the existing `non-text-contrast` check
  (`ctl-non-text-contrast`, WCAG 1.4.11 / RGAA 3.3).
- **`custom-checks/reduced-motion.ts`** (`complyloop-reduced-motion`) — emulates
  `prefers-reduced-motion: reduce` and detects CSS/WAAPI animations still running
  (duration ≥ 250 ms or infinite). Follows the `reflow.ts` pattern: temporarily
  emulate, evaluate, restore. Maps to the existing `reduced-motion` check
  (`ctl-reduced-motion`, WCAG 2.3.3).

The `reduced-motion` check runs before the parallel custom-check batch so its
temporary `emulateMedia` state never races the shared-page concurrency.

**Remaining from item 1:** dark/light scheme, 200% zoom, and small-viewport
emulations are still TODO (reflow/`resize-text` already cover the 320px
viewport axis).
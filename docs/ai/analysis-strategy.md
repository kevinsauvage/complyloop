# Accessibility analysis strategy

How ComplyLoop finds accessibility issues, which analysis layers exist, and
which checks to add next.

> **What else can ComplyLoop test?**

The answer is not "add more scanners". Combine different evidence-producing
layers and correlate them back to compliance:

**Source code → Rendered DOM → Accessibility tree → Browser state → Interaction
behaviour → Visual rendering → Site-level consistency → Human verification**

then map observations to **RGAA/WCAG requirement → finding → root cause →
remediation → verification → evidence**.

---

## 1. Executive decision

**Keep** the current foundation: ~78 AST checks, `eslint-plugin-jsx-a11y`,
`axe-core`, ~21 Playwright custom checks, site-level checks, RGAA/WCAG mappings.

**Add next** (ordered):

1. Complete browser-condition emulation — dark/light, forced colors, reduced
   motion, zoom/text scaling, small viewport/responsive; `prefers-contrast`
   where useful.
2. **`html-validate` (section 13) — shipped.** One rendered pass on the
   generated DOM, mapped to RGAA 8.2 / 10.1 controls.
3. Expand custom interaction checks — **partially shipped** (dialog-focus,
   announcement). Next: menus, tabs, disclosure/accordion, form validation,
   focus visibility, scroll/target-size.
4. Visual regression only as Playwright screenshot assertions (regression
   evidence, not an "AI vision scanner").
5. Site/content integrity — broken links, duplicate IDs, language, titles,
   heading/landmark consistency, navigation consistency.
6. Human verification layer — screen reader, keyboard, zoom, cognitive/content.

**Do not add another generic scanner** as a core engine (see section 6).

The objective is not maximum rule count. It is **maximum independent evidence
coverage with minimal duplication**.

---

## 2. Core principle: analyzers are evidence producers

A single underlying defect can appear in several representations (JSX, DOM,
axe, interaction). ComplyLoop should correlate those observations into **one
finding**, not five tickets.

The compliance domain produces findings; analyzers only produce observations.

---

## 3. Current stack

| Layer                  | Implementation                                           | Role                                       |
| ---------------------- | -------------------------------------------------------- | ------------------------------------------ |
| Source AST             | ~78 custom checks (`packages/analysis-core/src/checks/`) | Cheap, early, explainable source evidence  |
| React/JSX source       | `eslint-plugin-jsx-a11y`                                 | React-specific patterns, source specialist |
| Rendered accessibility | `axe-core`                                               | Baseline automated rendered engine         |
| Browser/runtime        | ~21 Playwright checks                                    | Behaviour, styles, media, state            |
| Site-level             | `runtime/site-level/`                                    | Cross-route consistency                    |
| RGAA mapping           | Existing requirement/check mappings                      | Turns findings into RGAA/WCAG evidence     |

**Never interpret `axe = 0 violations` as `site = compliant`.** Automated
testing is inherently incomplete; axe itself reports `incomplete` cases that
need human review. QA = axe + custom checks + site checks + behaviour checks +
human review where required.

### AST checks — keep, don't overload

Good at suspicious JSX, statically-knowable missing attributes, bad component
patterns, fast feedback. Weak at runtime values, CSS, real DOM semantics,
generated/dynamic content, focus, visual rendering. Its role is
**cheap, early, explainable source evidence** — do not make it understand
everything.

### `jsx-a11y` — don't duplicate rules

Do not re-implement every `jsx-a11y` rule as a custom check. Instead pipe it
through the same normalization: external analyzer → normalized observation →
RGAA/WCAG mapping → canonical finding.

---

## 4. Browser-condition analysis (`html-validate` note)

A page is not "tested" for passing in one default browser state. Emulation
(forcedColors, dark, reducedMotion, zoom, viewport) creates a _condition_, not a
check; a check must then ask whether important information or control state
disappears.

Required profiles: default, dark, light, forced colors, reduced motion, small
viewport, large text/zoom, high-contrast preference, touch/mobile.

### Forced colors (shipped)

`custom-checks/forced-colors.ts` → `complyloop-forced-colors`. Detects
interactive controls whose presence relies only on `box-shadow`/`background-image`
and checks for a usable fallback; maps to RGAA 3.3 / WCAG 1.4.11. Next: a
browser-state comparison (normal vs forced-colors) to find meaningful visual
loss, not every CSS diff.

### Reduced motion (shipped)

`custom-checks/reduced-motion.ts` → `complyloop-reduced-motion`. Emulates
`prefers-reduced-motion: reduce`, detects CSS/WAAPI animations. Next: separate
"animation exists" from "animation is harmful" — inspect continuous/auto-play,
pause/stop controls, flashing, and whether reduced-motion changes the experience.

### Dark/light (High priority)

Run selected checks under dedicated light and dark profiles. Detect text/icons
disappearing, invisible borders and focus indicators, insuff‑contrast states,
hard-coded theme assumptions, state indicators visible in one theme only. Do not
build a generic theme checker — the useful form is
_same requirement, different browser condition, different evidence_ (e.g. focus
indicator PASS in light, FAIL in dark) rather than "17 CSS differences".

### 200% zoom / text resizing (High priority)

Distinct from a 320px viewport. Increase zoom/effective text scale and detect
unexpected page-level horizontal overflow, clipped essential content,
inaccessible or overlapping controls, content hidden behind fixed/sticky UI.
Do **not** use a naive `scrollWidth > clientWidth => failure` rule; horizontal
scrolling can be legitimate.

### Small viewport / responsive (High priority)

320×568, 375×667, 768×1024 (configurable). Detect overflow, clipped/hidden
content, off-screen dialogs, inaccessible menus, fixed headers covering focused
elements, content-order problems, too-small targets. Avoid combinatorial
explosion: use a baseline profile + targeted responsive profiles + targeted
checks — not every check on every viewport.

---

## 5. `html-validate` (rendered-DOM structure) — shipped

`html-validate` is a deterministic, offline HTML5 validator (content models,
open/close, nesting, obsolete markup, references). It owns a representation
nothing else in the stack sees: **is the generated HTML well-formed?** — axe
reads the accessibility tree of an already-repaired DOM; the AST checks read JSX.

### Decision: include it — as evidence for RGAA 8.2 and 10.1, nothing else

It is _not_ another accessibility engine. Every enabled rule must answer one of
two RGAA questions the browser and axe cannot:

| RGAA test                                                                                      | WCAG            | html-validate contributes                                                                            |
| ---------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| **8.2.1** — valid nesting, open/close, unique `id`s, no duplicated attributes                  | 4.1.1 (parsing) | `element-permitted-content`/`-order`, `close-order`, `no-implicit-close`, `no-dup-attr`, `no-dup-id` |
| **10.1.1 / 10.1.2** — no presentational elements/attributes (`<font>`, `<center>`, `align`, …) | 1.3.1           | `deprecated`, `no-deprecated-attr`                                                                   |

Anything outside those two criteria is either owned by axe/AST (ARIA, names,
labels, headings) or lint noise (quotes, casing, whitespace).

### Where it runs

**Inside the runtime audit, on the generated DOM.** Projects supply a preview
URL and RGAA judges the generated document — the exact evidence an agency puts
in a déclaration d'accessibilité.

- Rendered pass in `scanRuntime` per route: serialize `document.documentElement`
  (node→offset) → `validateStringSync`; engine `"runtime"`, `dom` location
  (url + selector + snippet).
- Reuses the page already open for axe + custom checks — no extra browser cost.
- The serializer records each element's start offset in the validated string, so
  every message maps back to a concrete `dom` location like other runtime
  findings. Findings carry `engine: "runtime"` → the remediation flow is
  guidance → approve → implement → re-audit; a clean audit can genuinely _pass_
  a requirement.
- **It does NOT run in `complyloop-check`** (needs a browser). The CLI stays
  browserless; its findings come from the AST checks.

Implementation: `runtime/html-validate-runtime.ts` (serializer + validator),
`runtime/html-validate-map.ts` (rule→check-id map, same shape as `axe-map.ts`).
Reported as `htmlValidateRan` in `AssessmentEngines`.

### Rule → check id → control mapping

There is **no "advisory" tier** — a finding with no matching control is
invisible in the product. One control = one `checkId`, unique across the
catalog.

| html-validate rule                                                                      | Check id               | Control (RGAA · WCAG)                                              | Authority             |
| --------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------ | --------------------- |
| `no-multiple-main`                                                                      | `landmark-one-main`    | `ctl-landmark-one-main` 12.6 · 1.3.1                               | runtime_only          |
| `unique-landmark`                                                                       | `landmark-unique`      | `ctl-landmark-unique` 12.6 · 1.3.1                                 | runtime_only          |
| `element-permitted-content`/`-order`, `close-order`, `no-implicit-close`, `no-dup-attr` | `markup-nesting`       | `ctl-markup-validity` 8.2 · 4.1.1 "Generated markup is valid HTML" | runtime_only          |
| `no-deprecated-attr`, `deprecated`                                                      | `css-for-presentation` | `ctl-css-for-presentation` 10.1 · 1.3.1                            | runtime_only          |
| `no-dup-id`                                                                             | `duplicate-id`         | `ctl-duplicate-id` 8.2 · 4.1.2                                     | composition_sensitive |

Why:

- `markup-nesting` → `ctl-markup-validity`: 8.2.1 is literally "nesting valid,
  open/close valid, no duplicated attributes". It gets its own control because
  `ctl-duplicate-id` already owns the 8.2 code and a control has one check id.
  WCAG stays 4.1.1. Authority `runtime_only`: an open violation fails the
  requirement; a clean audit can _pass_ it.
- `no-deprecated-attr`/`deprecated` → `css-for-presentation`: the runtime check
  `css-for-presentation.ts` already reports deprecated presentational markup on
  the rendered DOM; same defect → same check id → one finding per instance.
  Severity `moderate`, matching that check.
- `no-dup-id` → `duplicate-id` (`composition_sensitive`): AST covers source;
  this covers the rendered DOM.

### Rules we will not enable

- Style/lint: `attr-quotes`, `attr-case`, `element-case`, `void-style`,
  `no-trailing-whitespace`, `no-inline-style`, `doctype-style`.
- Anything axe/AST already own: `wcag/*`, `empty-heading`, `empty-title`,
  `input-missing-label`, `aria-*`, `no-redundant-role`, `prefer-native-element`
  (two engines reporting one defect under two ids is the duplication this doc
  forbids).
- `no-unknown-elements` (web components/custom tags make it noise unless
  configured per project), `meta-refresh`, `no-autoplay` (already covered by
  runtime ids on the real page).

### Open follow-ups

Enable `valid-for` and `no-missing-references` in the rendered pass only after
confirming axe does not already report the same label/reference defects.

---

## 6. What NOT to add (as core engines)

| Tool / approach                      | Decision                         | Reason                                                   |
| ------------------------------------ | -------------------------------- | -------------------------------------------------------- |
| Lighthouse accessibility             | Skip as core                     | Overlaps axe-based audits                                |
| Pa11y / WAVE / Tenon                 | Skip as core                     | Same general class; Tenon adds external-service cost     |
| `jest-axe` / `vitest-axe`            | Skip as engine                   | Still axe                                                |
| `@axe-core/playwright`               | Keep skipped if injection stable | Uses local `axe.min.js` due to documented bundling issue |
| Generic AI vision scanner            | Skip                             | Hard to make deterministic/defensible                    |
| Generic CSS / HTML style linter      | Skip                             | Noise vs compliance value                                |
| Full screenshot scanning every route | Skip                             | Expensive, noisy, high maintenance                       |
| Every viewport × theme × state       | Skip                             | Combinatorial explosion                                  |

---

## 7. Checks to build next (interaction + structure)

An analyzer with the strongest future differentiation is **interaction
realism**: "does the control actually behave correctly?" rather than "does it
look correct?". Shipped: dialog focus and announcements. Next families:

- **Keyboard** — tab order, Enter/Space/Escape, arrow-key widget patterns,
  focus trap/restoration/visibility, reachability.
- **Dialogs / menus / tabs / accordions** — open → focus moves correctly →
  content accessible → Escape/close → focus returns to trigger; keyboard
  operation; accessible state/relationship.
- **Forms** — invalid submit → field errors → association → focus → correction →
  success state (full Detection → Behaviour → Verification story).
- **Dynamic announcements** — `aria-live` existing is not proof the user
  receives it; capture before/after accessibility-tree state and DOM mutations.
- **Focus** — treat as a reusable engine. Preserve evidence: trigger → action →
  focused element before/after → screenshot → a11y-tree state → DOM selector.
- **Contrast** — keep axe baseline; target state-dependent contrast, focus/
  hover/selected/disabled states, icons, border affordances, themes, forced
  colors. Apply the threshold to the _semantic target_ (text vs non-text UI vs
  focus indicator vs decorative), not blindly per pixel.
- **Links/references** — broken internal links, redirects, bad fragment targets,
  duplicate IDs, missing `aria-labelledby`/`aria-describedby`/`for` targets.
  Overlap with html-validate/axe is acceptable — normalize and deduplicate.
- **Structure** — titles, language, heading hierarchy, landmarks, skip links,
  navigation naming/consistency, document direction. Distinguish _definite
  failure_ from _likely problem / best practice / needs review_ (heading-skip
  warnings are not always failures).
- **Language** — `lang` present/valid/unexpected changes; detected content
  mismatch is a **signal → review**, never an automatic failure.
- **Media** — alt presence/ambiguity, SVG patterns; captions/transcript links,
  controls, autoplay indicators. "Captions exist" ≠ "captions accurate" — quality
  stays human.
- **Tables** — header cells, associations, scope, required captions, layout-table
  patterns.
- **CSS** — only targeted accessibility checks that change accessibility
  behaviour (`outline:none` without replacement, wrong visual-hidden, fixed
  overlays over focus, clipping, overflow:hidden around essential content).
  Not a CSS linter.
- **Target size / touch** — measure rendered bounds, account for adjacent
  spacing/exceptions, desktop vs touch; don't flag every small icon.
- **Hover/pointer-only content** — content appears → stays usable → dismissible →
  does not obscure required content; keyboard/focus equivalents, pointer
  cancellation, tooltip semantics.

### Site-level (becoming more important — monitors whole client sites)

Navigation consistency (labels/order/destination across routes), help/contact
link consistency, title consistency, and recurring regressions in repeated
components (headers, footers, nav, cookie banners, modals, design-system
components). The latter feeds the **shared-component root cause** differentiator:
32 accessible-name failures across 14 routes traced to one Button component =
one remediation. Preserve source location, component name, DOM location, route,
module/package, analyzer, requirement per finding.

---

## 8. Architecture & data model

### Cross-check correlation (first-class subsystem)

Correlate observations from multiple analyzers into one canonical finding
(e.g. jsx-a11y + axe + html-validate + custom RGAA all signalling a missing
label → "Form control has no programmatically associated label"). Retain all
observations (requirement, occurrences, source/DOM/browser/verification
evidence). **Never throw away raw analyzer results** — they feed debugging,
explainability, confidence, and analyzer-quality measurement.

### Analyzer contract

```ts
type AnalysisObservation = {
  analyzer: string;
  analyzerVersion: string;
  checkId: string;
  route?: string;
  sourceLocation?: { file: string; line?: number; column?: number };
  domTarget?: { selector?: string; xpath?: string; htmlSnippet?: string };
  result: "pass" | "fail" | "incomplete" | "not-applicable";
  confidence: "high" | "medium" | "low";
  evidence: Evidence[];
  mappings: { wcag?: string[]; rgaa?: string[] };
  metadata?: Record<string, unknown>;
};
```

Design decision: **analyzers produce observations; the compliance domain
produces findings.**

### Finding states

PASS, FAIL, INCOMPLETE, NEEDS_REVIEW, NOT_APPLICABLE, UNTESTED. Do not collapse
"not tested" → "passed" or "automation can't determine" → "failed" — this
distinction is critical for trustworthy evidence.

### Evidence hierarchy

Prefer: deterministic browser observation > deterministic source observation >
deterministic document validation > behavioural test result > visual regression
evidence > correlated multi-analyzer evidence > human verification > AI
interpretation. **AI interprets evidence; it does not manufacture it**
(verification over AI confidence).

### Check applicability

Each check exposes applicability metadata (`requires.forms/video/dialog/...`,
`excludes.staticPage`) so "no video found" yields **Not applicable**, not
"Video accessibility failed".

### False-positive strategy

Every new check is evaluated on detection rate, false-positive/negative risk,
runtime cost, evidence quality, remediation usefulness, RGAA mapping quality.
Rank: high-confidence + high-impact + cheap → … → medium-confidence+high-impact +
good evidence → human-review candidate → low-confidence heuristic. A check with
excellent theory but poor trust should not be prioritized.

### Measuring analyzers

Track findings by analyzer/requirement, correlated findings, duplicate /
false-positive / manual-override / verification-pass / regression rates,
runtime cost — an internal feedback loop to improve custom heuristics.

### Evidence graph

Long-term: Requirement → source/runtime/browser/behaviour/visual evidence →
human verification → canonical finding → remediation → verification → evidence.
The durable asset is the relationship _Requirement ↔ Code ↔ DOM ↔ Browser state
↔ Finding ↔ Fix ↔ Verification ↔ Evidence_, not a list of checks.

---

## 9. Recommended analyzer matrix

| Layer                 | Tool                              | Priority             | Automated confidence |
| --------------------- | --------------------------------- | -------------------- | -------------------- |
| Source AST            | custom AST                        | Existing             | High/Medium          |
| React source          | `eslint-plugin-jsx-a11y`          | Existing             | High/Medium          |
| Rendered a11y         | `axe-core`                        | Existing             | High/Medium          |
| HTML structure        | `html-validate` (RGAA 8.2/10.1)   | Existing + expand    | High                 |
| Browser state         | Playwright (media/viewport/style) | Existing + expand    | Medium/High          |
| Keyboard              | Playwright                        | **Next**             | High                 |
| Focus                 | Playwright                        | **Next**             | High                 |
| Dynamic announcements | Playwright                        | **Next**             | Medium/High          |
| Visual regression     | Playwright snapshots              | **Next**             | Medium               |
| Site integrity        | Custom                            | Existing + expand    | Medium/High          |
| Links/references      | Custom + html-validate            | **Next**             | High                 |
| Language              | Custom                            | Later                | Medium               |
| Media                 | Custom + DOM                      | Later                | Medium               |
| Nu HTML Checker       | v.Nu                              | Later                | High                 |
| Screen reader         | Human                             | Required human stage | Human                |
| Content quality       | Human                             | Required human stage | Human                |

---

## 11. What "good coverage" actually means

Measure by **coverage** (each relevant requirement has ≥1 verification path),
**independence** (findings from genuinely different evidence layers),
**confidence** (automated findings survive human review), **actionability**
(developer can understand and fix), **verification** (system proves the fix
worked), **regression resistance**, and **evidence quality** (agency can explain
what/when/how/with-what-result). Not "we have 500 checks".

ComplyLoop's analysis engine is not "an accessibility scanner". It is:

> **A multi-layer evidence system that evaluates accessibility requirements
> across source code, rendered UI, browser conditions, interaction behaviour,
> site structure, visual rendering, and human verification.**

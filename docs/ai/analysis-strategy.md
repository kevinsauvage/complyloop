# Accessibility analysis strategy

How ComplyLoop finds accessibility issues, what each analysis layer covers, where
the remaining gaps are, and which checks should be added next.

This document is the engineering strategy behind the question:

> **What else can ComplyLoop test?**

The answer is not "add more accessibility scanners". The strategy is to combine
different evidence-producing layers:

**Source code → Rendered DOM → Accessibility tree → Browser state → Interaction
behaviour → Visual rendering → Site-level consistency → Human verification**

The product then correlates those observations back to:

**RGAA/WCAG requirement → finding → root cause → remediation → verification → evidence**

---

## 1. Executive decision

### Keep the current foundation

ComplyLoop already has a strong analysis foundation:

| Layer                  | Current implementation                             | Primary value                                    |
| ---------------------- | -------------------------------------------------- | ------------------------------------------------ |
| Source                 | ~78 AST checks                                     | Fast source-level signals, CI/dev feedback       |
| React/JSX              | `eslint-plugin-jsx-a11y` coverage where applicable | React-specific accessibility patterns            |
| Rendered accessibility | `axe-core`                                         | Automated DOM/accessibility checks               |
| Browser/runtime        | ~21 custom Playwright checks                       | Behaviour, styles, media, viewport and state     |
| Site-level             | `runtime/site-level/`                              | Cross-route consistency                          |
| RGAA mapping           | Existing requirement/check mappings                | Turns technical findings into RGAA/WCAG evidence |

### Add next

The recommended roadmap is:

1. **Complete Playwright condition emulation**
   - dark/light
   - forced colors
   - reduced motion
   - zoom/text scaling
   - small viewport / responsive states
   - preferably `prefers-contrast` where useful

2. **`html-validate`** (section 13) — **shipped**
   - one rendered pass on the generated DOM, mapped to RGAA 8.2 / 10.1 controls
   - structure/semantics only — not another a11y engine

3. **Expand custom browser interaction checks**
   - keyboard/focus flows
   - dialogs
   - menus
   - tabs
   - disclosure/accordion
   - form validation
   - dynamic announcements
   - focus restoration
   - focus visibility
   - scroll/target-size behaviour

4. **Add visual regression selectively**
   - Playwright screenshot assertions first
   - use visual snapshots as regression evidence, not as a generic "AI vision scanner"
   - hosted products such as Chromatic/Percy can come later if customers need review workflows

5. **Add site/content integrity checks**
   - broken internal links
   - duplicate IDs/references
   - language metadata
   - title consistency
   - heading structure
   - landmark consistency
   - route-to-route navigation/help consistency

6. **Build the human verification layer**
   - screen reader
   - keyboard-only
   - zoom
   - cognitive/content checks
   - complex interaction verification

### Do not add another generic scanner

Do not make Lighthouse, Pa11y, WAVE, Tenon, `jest-axe`, or `vitest-axe`
core analysis engines.

The objective is not maximum rule count.

The objective is **maximum independent evidence coverage with minimal duplication**.

---

# 2. The core principle: analyzers are evidence producers

An analyzer should not be thought of as "the thing that decides whether the
site is compliant".

Each analyzer observes a different representation of the product:

```text
                         RGAA / WCAG requirement
                                  │
                                  ▼
                         ┌─────────────────┐
                         │   Requirement   │
                         └────────┬────────┘
                                  │
                 ┌────────────────┼────────────────┐
                 ▼                ▼                ▼
             Source code      Rendered DOM     Browser state
                 │                │                │
                 ▼                ▼                ▼
              AST / ESLint      axe-core       Playwright
                 │                │                │
                 └────────────────┼────────────────┘
                                  ▼
                           Cross-check layer
                                  │
                                  ▼
                         Canonical finding
                                  │
                 ┌────────────────┼────────────────┐
                 ▼                ▼                ▼
             Root cause       Remediation       Verification
                                  │
                                  ▼
                               Evidence
```

This matters because the same underlying accessibility defect can appear in
several representations.

Example:

```text
React JSX:
  <button aria-label={label} />

AST:
  potentially missing/uncertain accessible name

Rendered DOM:
  <button aria-label=""></button>

axe:
  button-name failure

HTML validation:
  structurally valid

Browser interaction:
  button is focusable and clickable

Canonical finding:
  "Interactive control has no accessible name"
```

ComplyLoop should correlate these observations into **one finding**, not five
tickets.

---

# 3. Current analysis stack

## 3.1 Source AST checks

Location:

```text
packages/analysis-core/src/checks/
```

Current scope:

- ~78 AST checks
- source-level
- framework-aware heuristics
- FR/EN/ES/DE text heuristics
- useful without launching a browser
- suitable for CI and developer feedback

### Best at

- finding suspicious JSX patterns
- detecting missing attributes when statically knowable
- identifying bad component patterns
- checking code conventions
- finding likely RGAA requirements from source
- fast feedback

### Weak at

- computed runtime values
- CSS
- actual DOM semantics
- generated markup
- dynamic content
- conditional rendering
- browser accessibility tree
- focus behaviour
- visual rendering
- responsive behaviour

### Strategic role

Keep AST checks.

Do not attempt to make the AST layer understand everything.

Its role is:

> **Cheap, early, explainable source evidence.**

---

# 4. React / JSX accessibility analysis

Where available, `eslint-plugin-jsx-a11y` should remain a source-level
specialist rather than becoming the product's canonical rule system.

Useful rule families include:

- `alt-text`
- `heading-has-content`
- `label-has-associated-control`
- `interactive-supports-focus`
- `no-noninteractive-tabindex`
- ARIA role/property compatibility
- redundant roles
- unsupported ARIA
- static interaction handlers

These rules are useful precisely because they understand JSX and React
patterns that a generic HTML parser does not.

### Important architectural rule

Do not duplicate every `jsx-a11y` rule as a custom ComplyLoop check.

Instead:

```text
External analyzer
       │
       ▼
Normalized observation
       │
       ▼
RGAA/WCAG mapping
       │
       ▼
Canonical ComplyLoop finding
```

This lets the product benefit from mature ecosystem rules without making the
external package itself part of the domain model.

---

# 5. axe-core

`axe-core` remains the primary automated rendered accessibility engine.

It operates on the browser-rendered UI and covers a large set of WCAG and
best-practice checks.

It is valuable because it sees the result of:

- React rendering
- CSS
- ARIA
- browser semantics
- dynamic DOM changes
- actual element relationships

However, automated accessibility testing is inherently incomplete. axe-core
itself reports `incomplete` cases where human review is needed.

### Strategic role

```text
axe-core = baseline automated accessibility engine
```

Do not attempt to replace it with another scanner.

Do not interpret:

```text
axe = 0 violations
```

as:

```text
site = compliant
```

Instead:

```text
axe passed
+
custom checks passed
+
site checks passed
+
required behaviour checks passed
+
human checks completed where necessary
```

---

# 6. Custom Playwright checks

Location:

```text
packages/analysis-core/src/runtime/custom-checks/
```

Current scope:

- ~21 custom checks
- reflow
- focus
- hover
- contrast
- media
- error prevention
- CAPTCHA
- other RGAA/WCAG-specific runtime checks

This is where ComplyLoop can create substantially more differentiation.

Playwright can control the browser and inspect:

- DOM
- computed styles
- focus
- viewport
- media features
- interaction states
- keyboard events
- screenshots
- accessibility snapshots
- network/runtime state

The key is to use it for things that axe cannot reliably establish by itself.

---

# 7. Browser-condition analysis

This should become a first-class analysis family.

A page should not be considered tested merely because it passed in one default
browser state.

## 7.1 Required browser profiles

| Profile                  | Why                                                     |
| ------------------------ | ------------------------------------------------------- |
| Default                  | Baseline                                                |
| Dark                     | Theme-dependent contrast/visibility                     |
| Light                    | Theme-dependent contrast/visibility                     |
| Forced colors            | Windows High Contrast-style failures                    |
| Reduced motion           | Motion/animation accessibility                          |
| Small viewport           | Responsive/reflow failures                              |
| Large text / zoom        | Resize-text and layout failures                         |
| High contrast preference | Additional contrast-sensitive behaviour where supported |
| Touch/mobile             | Interaction and target-size issues where relevant       |

Playwright currently supports browser emulation for `colorScheme`,
`forcedColors`, `reducedMotion`, `contrast`, and viewport settings.

### Important distinction

Emulation is not itself a check.

For example:

```text
forcedColors = active
```

only creates the condition.

A check must then determine:

```text
Does important information/control state disappear?
```

The same applies to:

```text
dark mode
reduced motion
zoom
small viewport
```

---

# 8. Forced colors

Current implementation:

```text
custom-checks/forced-colors.ts
complyloop-forced-colors
```

Current approach:

- detects interactive controls whose visual presence relies only on
  `box-shadow` or `background-image`
- checks for a usable fallback such as border, outline, text, or filled
  background
- maps to non-text contrast / WCAG 1.4.11 / RGAA 3.3

This is a good custom check because it captures a rendering/state problem that
is not equivalent to a generic axe violation.

### Next improvement

Do not stop at authored-style heuristics.

Add a browser-state comparison where practical:

```text
Normal state
      ↓
Forced-colors state
      ↓
Compare:
- visibility
- computed colors
- borders/outlines
- control states
- text/icon presence
```

Use this primarily to identify meaningful visual loss, not to flag every CSS
difference.

---

# 9. Reduced motion

Current implementation:

```text
custom-checks/reduced-motion.ts
complyloop-reduced-motion
```

Current approach:

- emulates `prefers-reduced-motion: reduce`
- detects CSS/WAAPI animations still running
- duration threshold ≥ 250 ms or infinite
- runs before the parallel custom-check batch to avoid shared-page media-state
  races

This is the right architectural pattern.

### Next improvement

Separate:

```text
animation exists
```

from:

```text
animation is harmful / fails the applicable requirement
```

A running animation is not automatically an accessibility failure.

Future versions should inspect:

- continuous motion
- auto-playing animation
- user-controlled pause/stop
- flashing
- motion triggered by interaction
- whether reduced-motion actually changes the experience

---

# 10. Dark/light scheme

**Priority: High**

Add dedicated Playwright profiles:

```text
light
dark
```

Then run selected checks under both.

### What to detect

- text disappearing into background
- icons losing visibility
- borders becoming invisible
- focus indicators becoming invisible
- controls with insufficient contrast
- images/backgrounds exposing hidden content
- hard-coded theme assumptions
- state indicators visible in one theme but not another

### Do not build a generic theme checker

The useful abstraction is:

```text
same requirement
different browser condition
different observed evidence
```

For example:

```text
Requirement: focus indicator remains visible

Light mode: PASS
Dark mode: FAIL
```

That is a much more useful finding than:

```text
dark theme has 17 CSS differences
```

---

# 11. 200% zoom / text resizing

**Priority: High**

This is different from simply testing a 320px viewport.

The product should eventually distinguish:

```text
Reflow
```

from:

```text
Resize text / zoom
```

### Test strategy

For representative pages/components:

1. Establish baseline.
2. Increase browser zoom / effective text scale.
3. Capture layout metrics.
4. Inspect horizontal overflow.
5. Detect clipped or hidden text.
6. Detect controls becoming inaccessible.
7. Detect overlapping content.
8. Detect content disappearing behind fixed/sticky UI.

### Important

Do not create a naive:

```text
scrollWidth > clientWidth => failure
```

rule.

Horizontal scrolling can be legitimate for certain content.

The check should identify:

- unexpected page-level horizontal overflow
- clipped essential content
- inaccessible controls
- overlap
- loss of functionality

Existing reflow/320px coverage should remain separate.

---

# 12. Small viewport / responsive analysis

**Priority: High**

The existing reflow checks cover part of this axis.

Expand the viewport matrix only where useful:

```text
320 × 568
375 × 667
768 × 1024
```

Exact profiles should remain configurable rather than hard-coded forever.

### Detect

- horizontal overflow
- clipped text
- hidden controls
- off-screen dialogs
- inaccessible menus
- overlapping content
- fixed headers covering focused elements
- content order problems
- controls too small or unreachable

### Avoid combinatorial explosion

Do not run every check against every viewport.

Use:

```text
baseline profile
+
targeted responsive profiles
+
targeted checks
```

---

# 13. `html-validate` (rendered-DOM structure)

`html-validate` is a deterministic, offline HTML5 validator (content models,
open/close, nesting, obsolete markup, references). It earns its place because it
observes a representation nothing else in the stack owns: **is the generated
HTML well-formed?** axe reads the accessibility tree of an already-repaired DOM;
the AST checks read JSX patterns. Neither tells you a `<div>` sits inside a
`<p>` or that a table has an orphan `<td>`.

## Decision: include it — as evidence for RGAA 8.2 and 10.1, nothing else

It is _not_ another accessibility engine. Every rule we enable must answer one
of two RGAA questions the browser and axe cannot:

| RGAA test                                                                                                     | WCAG            | html-validate contributes                                                                              |
| ------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------ |
| **8.2.1** — generated code: valid nesting, open/close, unique `id`s, no duplicated attributes                 | 4.1.1 (parsing) | `element-permitted-content` / `-order`, `close-order`, `no-implicit-close`, `no-dup-attr`, `no-dup-id` |
| **10.1.1 / 10.1.2** — no presentational elements (`<font>`, `<center>`) or attributes (`align`, `bgcolor`, …) | 1.3.1           | `deprecated`, `no-deprecated-attr`                                                                     |

Anything outside those two criteria is either already owned by axe/AST (ARIA,
names, labels, headings) or is lint noise (quotes, casing, whitespace).

## Where it runs

**Inside the runtime audit, on the generated DOM.** Projects supply a preview
URL, and RGAA judges the generated document — so we validate the HTML a browser
actually produces. This is exactly the evidence an agency can put in a
déclaration d'accessibilité.

```text
Rendered pass (in scanRuntime, per route)
serialize document.documentElement (node→offset) → validateStringSync
engine: "runtime" · location: dom (url + selector + snippet)
```

- Reuses the page already open for axe + custom checks — no extra browser cost.
- The serializer records each element's start offset in the exact string it
  validates, so every html-validate message (a line/column in that string) maps
  back to a concrete `dom` location, like every other runtime finding.
- Findings carry `engine: "runtime"` and a `dom` location → the remediation flow
  is guidance → approve → implement → re-audit. A clean audit is a real verdict
  that can _pass_ a requirement.
- **It does NOT run in `complyloop-check`** (needs a browser). The CLI stays
  browserless; its findings come from the AST checks.

Implementation: `runtime/html-validate-runtime.ts` (serializer + validator) and
`runtime/html-validate-map.ts` (rule→check-id map, same shape as `axe-map.ts`).
Reported as `htmlValidateRan` in `AssessmentEngines`.

## Rule → check id → control mapping

Every enabled rule maps to a control the catalog owns. There is no "advisory"
tier — a finding with no matching control is invisible in the product (see
below). One control = one `checkId`, unique across the catalog.

| html-validate rule                                                                        | Check id               | Control (RGAA · WCAG)                                              | Authority             |
| ----------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------ | --------------------- |
| `no-multiple-main`                                                                        | `landmark-one-main`    | `ctl-landmark-one-main` 12.6 · 1.3.1                               | runtime_only          |
| `unique-landmark`                                                                         | `landmark-unique`      | `ctl-landmark-unique` 12.6 · 1.3.1                                 | runtime_only          |
| `element-permitted-content` / `-order`, `close-order`, `no-implicit-close`, `no-dup-attr` | `markup-nesting`       | `ctl-markup-validity` 8.2 · 4.1.1 "Generated markup is valid HTML" | runtime_only          |
| `no-deprecated-attr`, `deprecated`                                                        | `css-for-presentation` | `ctl-css-for-presentation` 10.1 · 1.3.1                            | runtime_only          |
| `no-dup-id`                                                                               | `duplicate-id`         | `ctl-duplicate-id` 8.2 · 4.1.2                                     | composition_sensitive |

Why:

- **`markup-nesting` → `ctl-markup-validity`.** Test 8.2.1 is literally
  "nesting valid, open/close valid, no duplicated attributes". It gets its own
  control because `ctl-duplicate-id` already owns the 8.2 code and a control has
  one check id. The WCAG code stays 4.1.1 (also `ctl-doctype`'s reference).
  Authority is `runtime_only`: an open violation fails the requirement, and a
  clean audit is a real rendered-document verdict that can _pass_ it.
- **`no-deprecated-attr` / `deprecated` → `css-for-presentation`.** The runtime
  check `css-for-presentation.ts` already reports deprecated presentational
  markup on the rendered DOM; same defect → same check id → one finding per
  instance. Severity is `moderate`, matching that check.
- **`no-dup-id` → `duplicate-id`** (`composition_sensitive`): the AST check
  covers source; this covers the rendered DOM.

## Rules we will not enable

- Style/lint: `attr-quotes`, `attr-case`, `element-case`, `void-style`,
  `no-trailing-whitespace`, `no-inline-style`, `doctype-style`.
- Anything axe or an AST check already owns: `wcag/*`, `empty-heading`,
  `empty-title`, `input-missing-label`, `aria-*`, `no-redundant-role`,
  `prefer-native-element`. Two engines reporting one defect under two ids is the
  duplication section 1 forbids.
- `no-unknown-elements`: web components / custom tags make it noise unless
  configured per project.
- `meta-refresh`, `no-autoplay`: already covered by runtime ids (`no-auto-refresh`,
  media checks) on the real page.

## Open follow-ups

- Enable `valid-for` and `no-missing-references` in the rendered pass only after
  confirming axe does not already report the same label/reference defects.

---

# 15. Visual regression

## Decision: YES, but selectively

Axe and DOM inspection do not inspect pixels.

Visual problems can include:

- clipped text
- overlapping controls
- content outside the viewport
- broken responsive layout
- focus indicator visually disappearing
- text rendered over images
- content hidden behind fixed elements
- theme-specific rendering failures

Playwright Test supports screenshot comparison through
`toHaveScreenshot()`.

### Recommended architecture

```text
                 Browser page
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
     DOM / a11y                Screenshot
       checks                    checks
          │                       │
          └───────────┬───────────┘
                      ▼
              Canonical finding
```

### Do not turn this into a screenshot-scanning product

Visual regression should initially answer:

> "Did something visually important regress compared with a known-good state?"

It should not attempt to infer every WCAG rule from pixels.

### Baseline strategy

Use snapshots for:

- critical routes
- critical components
- known responsive breakpoints
- critical states
- light/dark when relevant
- focused/expanded/error states where relevant

Do not snapshot every route and every state by default.

That creates huge maintenance cost and false positives.

---

# 16. Accessibility tree / ARIA snapshots

Playwright can expose and assert the browser's accessibility tree.

This creates another useful layer between:

```text
DOM
```

and:

```text
real screen reader
```

It can detect regressions such as:

- missing accessible names
- unexpected roles
- missing states
- broken relationships
- content disappearing from the accessibility tree

### Strategic role

Use accessibility-tree inspection for **targeted deterministic assertions**.

Examples:

```text
Dialog:
  role=dialog
  accessible name exists
  focus enters dialog
  focus returns after close
```

```text
Tabs:
  tablist exists
  tabs have expected states
  selected tab changes
  associated tabpanel is exposed
```

This should complement axe, not replace it.

---

# 17. Interaction realism

This is one of the highest-value expansion areas.

Static analysis asks:

> "Does this control look correct?"

Interaction testing asks:

> "Does this control actually behave correctly?"

## Priority interaction families

### Keyboard

- Tab order
- Shift+Tab
- Enter
- Space
- Escape
- arrow-key patterns for widgets
- focus trapping
- focus restoration
- focus visibility
- keyboard reachability

### Dialogs

Test:

```text
open
  ↓
focus moves correctly
  ↓
content accessible
  ↓
Escape / close works
  ↓
focus returns to trigger
```

### Menus

Test:

- opening
- keyboard navigation
- Escape
- focus
- submenu behaviour
- accessible state

### Tabs

Test:

- selected state
- keyboard navigation
- associated panel
- focus
- URL/history behaviour where relevant

### Disclosure / accordion

Test:

- expanded/collapsed state
- keyboard operation
- accessible relationship
- content visibility

### Forms

Test:

- invalid submission
- field errors
- error association
- summary behaviour
- focus movement
- correction
- success state

---

# 18. Dynamic announcements

This should be a dedicated check family.

A static source heuristic can detect:

```text
aria-live exists
```

but that does not prove:

```text
the user actually receives the important announcement
```

### Example

```text
Submit invalid form
       ↓
Validation runs
       ↓
Error appears
       ↓
Error is associated with field
       ↓
Error summary / live region changes
       ↓
Accessible tree reflects the update
```

ComplyLoop should capture before/after accessibility-tree state and relevant
DOM mutations.

### Priority

**High.**

This is a strong example of where real browser execution creates more value
than adding another static scanner.

---

# 19. Focus analysis

Focus should become its own reusable engine.

## Detect

- focus disappears after interaction
- focus moves behind overlays
- focus trapped incorrectly
- focus not trapped when required
- focus not restored
- focus indicator invisible
- focus lands on non-actionable content
- focused element covered by sticky UI
- focus jumps unexpectedly

### Evidence

A focus finding should preserve:

```text
trigger
→ action
→ focused element before
→ focused element after
→ screenshot if relevant
→ accessibility-tree state
→ DOM selector
```

This is much stronger evidence than:

```text
"keyboard accessibility may be broken"
```

---

# 20. Form and error-prevention analysis

Current:

```text
error-prevention.ts
```

should evolve from heuristics toward real-flow verification.

### Static layer

Detect likely problems:

- form fields without labels
- invalid ARIA relationships
- suspicious required/error patterns

### Runtime layer

Actually:

1. submit invalid data
2. inspect errors
3. verify association
4. verify announcement where applicable
5. verify focus
6. correct the field
7. submit again
8. verify success state

This gives ComplyLoop a full:

```text
Detection → Behaviour → Verification
```

story.

---

# 21. Contrast and visual-state checks

Contrast should be treated as more than a single numeric calculation.

### Baseline

Keep axe contrast checks.

### Custom checks should target

- text over dynamic backgrounds
- state-dependent contrast
- focus indicators
- selected/unselected states
- hover/focus/active states
- disabled state where applicable
- icons carrying meaning
- border-based control affordances
- theme differences
- forced-colors behaviour

### Important

Do not blindly apply one contrast threshold to every pixel.

The analyzer should understand the semantic target:

```text
text
non-text UI component
focus indicator
decorative content
state indicator
```

---

# 22. Link and reference integrity

This should be added as a site-level analysis family.

## Checks

### Internal links

- broken internal links
- unexpected redirects
- inaccessible route targets
- duplicate URLs
- fragment targets that do not exist

### ID/reference relationships

- duplicate IDs
- missing `aria-labelledby` targets
- missing `aria-describedby` targets
- missing `for` targets
- broken fragment links

Some of this overlaps with `html-validate` and axe.

That is acceptable.

The key is to normalize and deduplicate observations.

---

# 23. Document structure checks

Build a dedicated structural layer around:

- page title
- language
- heading hierarchy
- landmarks
- main landmark
- navigation naming
- repeated navigation consistency
- skip links
- footer/header consistency
- document direction where relevant

### Important distinction

A heading hierarchy warning is not always a failure.

For example:

```text
h1
  h3
```

can be suspicious, but the product should avoid simplistic rules that create
false positives.

The finding engine should distinguish:

```text
definite failure
likely problem
best practice
needs human review
```

---

# 24. Language analysis

Add checks for:

### Document

- `lang` present
- valid language identifier
- unexpected language changes

### Content

Potentially detect:

- `lang` changes around foreign-language passages
- obvious mismatch between declared and detected language

But language detection should initially be:

```text
signal → review
```

not:

```text
automatic failure
```

Natural-language detection has too many legitimate edge cases.

---

# 25. Media analysis

Keep media checks separate from generic axe.

## Images

Automate:

- missing alt
- suspicious empty alt
- image used as control
- decorative/meaningful ambiguity
- SVG accessibility patterns

## Video/audio

Automate where technically possible:

- presence of captions tracks
- transcript links
- media controls
- autoplay indicators
- mute/state metadata

But:

```text
captions exist
```

does not prove:

```text
captions are accurate
```

Therefore content quality remains human review.

---

# 26. Tables

Add deterministic structural checks for:

- header cells
- header associations
- scope where applicable
- missing captions where required
- suspicious layout-table patterns

This is an area where HTML structure analysis can complement axe.

---

# 27. CSS / styling analysis

Do not build a generic CSS linter into ComplyLoop.

Instead, add targeted accessibility checks for CSS when they directly support
a requirement.

Examples:

- `outline: none` without replacement
- visually hidden content that remains incorrectly exposed/hidden
- fixed overlays covering focus
- text clipping
- `overflow: hidden` around essential content
- animations
- forced-colors incompatibility
- focus-state styling

The principle is:

> **CSS is evidence when it changes accessibility behaviour.**

Not:

> **Every CSS anti-pattern is a compliance finding.**

---

# 28. Target size and touch interaction

This should be a targeted runtime check.

For interactive controls:

- measure rendered bounds
- account for spacing/adjacent targets
- test relevant pointer/touch contexts
- identify controls that are too small or too tightly packed

Do not blindly flag every small icon.

The check must understand:

- interactive target
- adjacent spacing
- exception conditions
- desktop vs touch context

---

# 29. Hover / pointer-only content

Current custom checks already cover hover-related behaviour.

Expand them to test:

```text
hover
  ↓
content appears
  ↓
content remains usable
  ↓
content can be dismissed
  ↓
content does not obscure required content
```

Where relevant, also test:

- keyboard equivalent
- focus equivalent
- pointer cancellation
- persistent content
- tooltip semantics

---

# 30. Site-level analysis

Current:

```text
runtime/site-level/
```

with checks such as:

- navigation
- help
- titles

This should become increasingly important because ComplyLoop is intended to
monitor client sites rather than isolated pages.

## Add

### Navigation consistency

Compare routes for:

- primary navigation
- labels
- order
- destination consistency

### Help consistency

Detect:

- help/contact links disappearing on some routes
- inconsistent placement
- inconsistent naming

### Title consistency

Detect:

- missing titles
- duplicate titles
- titles that do not identify the page

### Repeated components

Detect recurring accessibility regressions in:

- headers
- footers
- navigation
- cookie banners
- modals
- design-system components

This directly supports the product's root-cause strategy.

---

# 31. Shared-component root cause

A major future differentiator is:

```text
Finding A
Finding B
Finding C
Finding D
       ↓
same component
       ↓
one root cause
```

For example:

```text
32 accessible-name failures
across 14 routes
       ↓
same Button component
       ↓
one remediation
```

The analyzer architecture should therefore preserve:

- source location
- component name
- DOM location
- route
- shared module
- package
- design-system component
- analyzer
- requirement

This is much more valuable than adding 50 more independent checks.

---

# 32. Cross-check correlation

This should be a first-class subsystem.

## Example

```text
jsx-a11y:
  missing label

axe:
  label

html-validate:
  valid-for

custom RGAA:
  form-control-label

        ↓

Correlation engine

        ↓

Canonical finding:
"Form control has no programmatically associated label"
```

The finding should retain all observations:

```text
finding
 ├── requirement
 ├── occurrences
 ├── source evidence
 ├── DOM evidence
 ├── browser evidence
 ├── analyzer observations
 └── verification evidence
```

### Never throw away the raw analyzer result

Raw observations are valuable for:

- debugging
- explainability
- future correlation improvements
- evidence
- confidence scoring
- analyzer quality measurement

---

# 33. Analyzer contract

Every analyzer should return a normalized observation.

Conceptually:

```ts
type AnalysisObservation = {
  analyzer: string;
  analyzerVersion: string;

  checkId: string;

  route?: string;

  sourceLocation?: {
    file: string;
    line?: number;
    column?: number;
  };

  domTarget?: {
    selector?: string;
    xpath?: string;
    htmlSnippet?: string;
  };

  result: "pass" | "fail" | "incomplete" | "not-applicable";

  confidence: "high" | "medium" | "low";

  evidence: Evidence[];

  mappings: {
    wcag?: string[];
    rgaa?: string[];
  };

  metadata?: Record<string, unknown>;
};
```

The important design decision is:

> **Analyzers produce observations. The compliance domain produces findings.**

---

# 34. Finding states

The analysis system should distinguish at least:

```text
PASS
FAIL
INCOMPLETE
NEEDS_REVIEW
NOT_APPLICABLE
UNTESTED
```

Do not collapse:

```text
not tested
```

into:

```text
passed
```

And do not collapse:

```text
automation cannot determine
```

into:

```text
failed
```

This distinction is critical for trustworthy evidence.

---

# 35. Evidence hierarchy

Prefer evidence in this order:

```text
1. Deterministic browser observation
2. Deterministic source observation
3. Deterministic document validation
4. Behavioural test result
5. Visual regression evidence
6. Correlated multi-analyzer evidence
7. Human verification
8. AI interpretation
```

AI should interpret evidence.

AI should not manufacture it.

The product's existing principle remains:

> **Verification over AI confidence.**

---

# 36. Human verification is not a failure of automation

Screen readers remain a major gap.

No automated package should be presented as reliably answering:

> "What does NVDA / VoiceOver actually say to a user?"

Therefore ComplyLoop should explicitly model human verification.

## Guided manual checks

### Screen reader

- landmark navigation
- heading navigation
- link/button naming
- form navigation
- dynamic announcements
- dialogs
- tables
- error messages

### Keyboard

- complete flow
- focus visibility
- focus order
- traps
- restoration

### Zoom

- 200%
- large text
- content visibility
- functionality

### Content

- alt text meaning
- captions accuracy
- instructions clarity
- error message quality

The product should turn these into structured evidence rather than a free-text
"looks good".

---

# 37. What NOT to add

| Tool / approach                         | Decision                                    | Reason                                                                                 |
| --------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------- |
| Lighthouse accessibility                | Skip as core                                | Significant overlap with axe-based accessibility audits                                |
| Pa11y                                   | Skip as core                                | Same general automated/static accessibility class                                      |
| WAVE                                    | Skip as core                                | Large overlap; limited incremental evidence                                            |
| Tenon                                   | Skip as core                                | Overlap plus external-service dependency/cost                                          |
| `jest-axe`                              | Skip as engine                              | Useful test integration, but still axe                                                 |
| `vitest-axe`                            | Skip as engine                              | Same reason                                                                            |
| `@axe-core/playwright`                  | Keep skipped if current injection is stable | Existing architecture uses local `axe.min.js` because of the documented bundling issue |
| Generic AI vision scanner               | Skip                                        | Hard to make deterministic and defensible                                              |
| Generic CSS linter                      | Skip                                        | Too much noise relative to compliance value                                            |
| Generic HTML style linter               | Skip                                        | Not the product's job                                                                  |
| Full screenshot scanning on every route | Skip                                        | Expensive, noisy, high maintenance                                                     |
| Every possible viewport × theme × state | Skip                                        | Combinatorial explosion                                                                |

---

# 38. Recommended analyzer matrix

| Layer                 | Tool                     | Scope                                            | Priority             | Automated confidence |
| --------------------- | ------------------------ | ------------------------------------------------ | -------------------- | -------------------- |
| Source AST            | Custom checks            | JSX/TSX patterns                                 | Existing             | High/Medium          |
| React source          | `eslint-plugin-jsx-a11y` | React a11y patterns                              | Existing             | High/Medium          |
| Rendered a11y         | `axe-core`               | DOM/accessibility                                | Existing             | High/Medium          |
| HTML structure        | `html-validate`          | RGAA 8.2 / 10.1 on the rendered DOM (section 13) | Existing + expand    | High                 |
| Browser state         | Playwright               | media/viewport/style                             | Existing + expand    | Medium/High          |
| Keyboard              | Playwright               | real interactions                                | **Next**             | High                 |
| Focus                 | Playwright               | focus lifecycle                                  | **Next**             | High                 |
| Dynamic announcements | Playwright               | runtime updates                                  | **Next**             | Medium/High          |
| Visual regression     | Playwright snapshots     | pixels/layout                                    | **Next**             | Medium               |
| Site integrity        | Custom                   | routes/navigation                                | Existing + expand    | Medium/High          |
| Links/references      | Custom + html-validate   | relationships                                    | **Next**             | High                 |
| Language              | Custom                   | document/content                                 | Later                | Medium               |
| Media                 | Custom + DOM             | captions/transcripts                             | Later                | Medium               |
| Nu HTML Checker       | v.Nu                     | independent HTML validation                      | Later                | High                 |
| Screen reader         | Human                    | actual AT output                                 | Required human stage | Human                |
| Content quality       | Human                    | semantics/meaning                                | Required human stage | Human                |

---

# 39. Recommended implementation order

## Phase 1 — Complete the current runtime foundation

1. Dark mode
2. Light mode
3. Forced colors hardening
4. Reduced-motion hardening
5. Responsive/small viewport
6. Zoom/text scaling
7. Focus visibility
8. Focus restoration
9. Keyboard traversal

**Goal:**

```text
One page
+
multiple browser conditions
+
real keyboard interaction
```

---

## Phase 3 — Build interaction scenarios

Create reusable scenarios:

```text
dialog
menu
tabs
accordion
form
error
tooltip
navigation
```

Each scenario should produce evidence.

Example:

```text
scenario: form-invalid-submit

steps:
  submit invalid form
  inspect error
  inspect focus
  inspect accessibility tree
  inspect live region

result:
  pass/fail/incomplete

evidence:
  screenshots
  DOM
  accessibility tree
  event timeline
```

---

## Phase 4 — Add visual regression

Start with:

- critical routes
- critical components
- responsive breakpoints
- important states

Use Playwright snapshots.

Do not introduce a hosted visual platform until there is a demonstrated
customer need.

---

## Phase 5 — Site-level intelligence

Expand:

- broken links
- references
- repeated navigation
- repeated components
- page titles
- landmarks
- help
- language
- recurring regressions

---

## Phase 6 — Human verification workflow

Build the manual review experience around:

```text
Requirement
   ↓
Automated evidence
   ↓
Human checklist
   ↓
Reviewer decision
   ↓
Evidence
```

This should not be a separate product area.

It is the final verification layer of the same compliance loop.

---

# 40. Performance strategy

The analysis system should not run the most expensive test against everything.

Use three execution tiers.

## Tier 1 — Fast source analysis

Runs:

- every commit
- local development
- PR

Includes:

- AST
- jsx-a11y

Target:

```text
seconds
```

---

## Tier 2 — Rendered analysis

Runs:

- PR
- preview deployment
- assessment

Includes:

- axe
- html-validate (rendered-DOM structure, section 13)
- selected Playwright custom checks
- site-level checks

Target:

```text
tens of seconds / low minutes
```

---

## Tier 3 — Deep verification

Runs:

- scheduled assessment
- release candidate
- explicit compliance assessment

Includes:

- multiple viewports
- multiple themes
- forced colors
- zoom
- complex interaction scenarios
- visual regression
- broader site crawl

Target:

```text
minutes
```

This prevents expensive browser analysis from slowing every developer action.

---

# 41. Avoiding combinatorial explosion

A naïve system could become:

```text
100 routes
× 6 viewports
× 2 themes
× 4 interaction states
× 10 checks
```

That is not scalable.

Instead, introduce:

## Coverage profiles

```text
PR profile
Release profile
Compliance profile
Regression profile
```

Example:

### PR

```text
changed routes
+
baseline viewport
+
axe
+
source checks
+
critical interaction scenarios
```

### Release

```text
representative routes
+
responsive profiles
+
themes
+
axe
+
custom runtime
+
visual snapshots
```

### Compliance assessment

```text
broader route crawl
+
all applicable automated checks
+
manual-review queue
```

---

# 42. Check applicability

Not every requirement applies to every page.

Each check should expose applicability metadata.

Conceptually:

```ts
type CheckApplicability = {
  requires?: {
    form?: boolean;
    video?: boolean;
    dialog?: boolean;
    navigation?: boolean;
    dataTable?: boolean;
    interactiveControl?: boolean;
  };

  excludes?: {
    staticPage?: boolean;
  };
};
```

This prevents:

```text
No video found
```

from becoming:

```text
Video accessibility failed
```

The correct result is:

```text
Not applicable
```

---

# 43. False-positive strategy

A compliance analyzer that generates too many false positives becomes unusable.

Every new check should be evaluated on:

```text
Detection rate
False-positive rate
False-negative risk
Runtime cost
Evidence quality
Remediation usefulness
RGAA mapping quality
```

A check with excellent theoretical coverage but poor developer trust should not
be prioritized.

### Preferred ranking

```text
High confidence + high impact + cheap
        ↓
High confidence + high impact + moderate cost
        ↓
Medium confidence + high impact + good evidence
        ↓
Human-review candidate
        ↓
Low-confidence heuristic
```

---

# 44. Measuring the analyzers themselves

ComplyLoop should eventually track:

```text
findings by analyzer
findings by requirement
correlated findings
duplicate rate
false-positive rate
manual override rate
verification pass rate
regression rate
runtime cost
```

This creates an internal feedback loop:

```text
Analyzer
   ↓
Finding
   ↓
Human decision
   ↓
Verification
   ↓
Analyzer quality metrics
   ↓
Improve analyzer
```

This is especially important for custom heuristics.

---

# 45. Evidence graph

The long-term architecture should look like:

```text
Requirement
     │
     ├───────────────┐
     ▼               ▼
Source evidence   Runtime evidence
     │               │
     ▼               ▼
AST / JSX         DOM / axe
     │               │
     └───────┬───────┘
             ▼
        Browser evidence
             │
             ▼
       Behaviour evidence
             │
             ▼
       Visual evidence
             │
             ▼
       Human verification
             │
             ▼
       Canonical finding
             │
             ▼
         Remediation
             │
             ▼
         Verification
             │
             ▼
           Evidence
```

The product's durable asset is not a list of checks.

It is the relationship between:

**Requirement ↔ Code ↔ DOM ↔ Browser state ↔ Finding ↔ Fix ↔ Verification ↔ Evidence**

---

# 46. What "good coverage" actually means

Do not measure success by:

```text
"We have 500 checks."
```

Measure it by:

### Coverage

How many relevant requirements have at least one automated or human
verification path?

### Independence

How many findings come from genuinely different evidence layers?

### Confidence

How often do automated findings survive human review?

### Actionability

Can the developer understand and fix the problem?

### Verification

Can the system prove that the fix worked?

### Regression resistance

Does the system detect when a previously verified requirement breaks again?

### Evidence quality

Can the agency explain what was checked, when, how, and with what result?

---

# 47. Revised definition of the analysis engine

ComplyLoop's analysis engine is not:

> "an accessibility scanner."

It is:

> **A multi-layer evidence system that evaluates accessibility requirements
> across source code, rendered UI, browser conditions, interaction behaviour,
> site structure, visual rendering, and human verification.**

The analyzer stack should therefore be:

```text
                 ┌─────────────────────────┐
                 │      RGAA / WCAG         │
                 │       requirements       │
                 └────────────┬────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
     Source layer        Render layer       Browser layer
     AST / JSX           axe / HTML         Playwright
          │                   │                   │
          └───────────────────┼───────────────────┘
                              ▼
                    Interaction layer
                              │
                              ▼
                     Visual/site layer
                              │
                              ▼
                     Correlation engine
                              │
                              ▼
                    Canonical findings
                              │
                              ▼
                    Human verification
                              │
                              ▼
                       Evidence graph
```

---

# 48. Final roadmap

## Keep

- Custom AST checks
- `eslint-plugin-jsx-a11y`
- `axe-core`
- Playwright
- Site-level checks
- RGAA/WCAG mappings
- Human verification

## Add now

- `html-validate` control wiring (RGAA 8.2 / 10.1) and rendered pass
- dark/light profiles
- zoom/text-size testing
- responsive profiles
- focus lifecycle
- keyboard scenarios
- dynamic announcement testing
- stronger link/reference checks

## Add next

- visual regression
- accessibility-tree assertions
- dialog/menu/tab/form scenario library
- target-size checks
- expanded site-level consistency
- shared-component correlation

## Add later

- Nu Html Checker as independent corroboration
- deeper media/content checks
- broader language analysis
- hosted visual review tooling if customers demand it

## Do not add as core engines

- Lighthouse
- Pa11y
- WAVE
- Tenon
- `jest-axe`
- `vitest-axe`
- generic AI visual scanners
- generic CSS/HTML style linters

---

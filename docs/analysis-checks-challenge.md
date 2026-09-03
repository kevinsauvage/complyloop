# Analysis checks — challenge

Audit of **how we analyze today**, whether each layer is the right tool, and **which extra npm packages would actually report more real defects**. Implementation details stay in [`docs/ai/architecture.md`](./ai/architecture.md). Decisions on what to build stay in [`docs/analysis-strategy.md`](./analysis-strategy.md).

## How we analyze today

| Layer | What actually runs | Verdict |
| --- | --- | --- |
| AST (`packages/analysis-core/src/checks/`) | Custom JSX/TS heuristics plus `eslint-plugin-jsx-a11y` on the same files. Used by `complyloop-check` and assessments. | Right for CI when there is no preview. Wrong as the **verdict** for CSS, focus, generated DOM, widgets. |
| axe-core (injected `axe.min.js`) | `axe.run()` on the **main frame**, **violations only**. ~91 axe rules mapped; 7 unmapped (all best-practice / experimental). | Right **baseline** for rendered a11y. Under-used: we drop `incomplete`, iframes, and unmapped rules. |
| html-validate | Curated rules on serialized generated DOM → RGAA 8.2 / 10.1 only. | Right tool, right scope. Held-back rules (`valid-for`, `no-missing-references`) would add real errors. |
| Playwright custom checks | Interaction / emulation probes after axe (`complyloop-*`). | Keep behaviour, viewport, and RGAA facts no engine reports. Do not rebuild axe `target-size` or html-validate presentation rules. |
| Site-level | ≥2 preview routes: nav, labels, help, sitemap, search, landmarks, duplicate titles. | Right tool. Unique vs any page scanner. |
| `eslint-plugin-jsx-a11y` | Wired on the clone in `jsx-a11y-scan.ts` (mapped rules only). | Done. Do not add a custom AST twin for a mapped plugin rule. |
| Theme pass | Re-runs a subset under dark / light / `prefers-contrast: more`. | Right idea. Filter by axe rule ids (`link-in-text-block`, not catalog `use-of-color`). |

**CI without `runtimeBaseUrl`:** AST only. Most runtime-only controls stay `unable_to_verify`. That is the largest reporting gap — not “too few scanners”.

**Merge:** when runtime ran, AST findings are dropped only for composition-sensitive + runtime-only ids. Same defect can still appear twice (AST + axe) for `img-alt`, ARIA, lists, captions, etc.

---

## Do not add another axe wrapper

These npm packages would **not** increase independent coverage. They run axe (or a thinner static copy of axe-like rules):

`pa11y`, Lighthouse accessibility, `@axe-core/playwright`, `jest-axe` / `vitest-axe`, WAVE/Tenon-style services, `@probeo/fast-a11y` (axe-shaped static subset).

`@axe-core/playwright` stays skipped: webpack rewrites axe `source`; disk `axe.min.js` is the correct adapter.

---

## Packages worth adding

Ordered by expected **new, defensible findings** vs integration cost.

### 1. `eslint-plugin-jsx-a11y` — wire as a source analyzer

**Done.** Mapped rules run on customer JSX/TSX in `jsx-a11y-scan.ts`. `control-has-associated-label` stays off (false positives vs `htmlFor`/`id`); AST `input-label` remains.

- **Fills:** React/JSX patterns we used to reimplement (`click-events-have-key-events`, `no-static-element-interactions`, `label-has-associated-control`, `autocomplete-valid`, …).
- **Does not fill:** computed contrast, focus, generated DOM.
- **Where:** `complyloop-check` and assessments (browserless).

### 2. `accessibility-checker` (IBM Equal Access)

Different rule engine from axe (ACT-oriented, IBM mappings). Can run in the **same Playwright page**.

- **Fills:** 2.5.8 (`target_spacing_sufficient`) if we want IBM’s exception model instead of axe `target-size`; some heading/landmark/ARIA combos axe misses. **Does not** replace Tab-based focus, reflow, or dialog restore (`style_focus_visible` is weaker than our focus compare).
- **Does not fill:** interaction, zoom, target size, site consistency.
- **How:** mapped subset only, same as axe-map. Unmapped IBM rules must not emit findings. Deduplicate by check id with axe.
- **Where:** runtime audit, after axe, on the open page.

This is the only extra **page scanner** that is justified. One sibling engine, not three.

### 3. html-validate — enable held-back rules (same package)

`valid-for` and `no-missing-references` were deferred pending an axe-overlap check.

- **Fills:** broken `for` / fragment / `aria-labelledby` / `aria-describedby` targets on **generated** HTML — AST cannot see composition; axe does not own all of this.
- **How:** map onto existing `input-label` / `duplicate-id` / a dedicated references check id; drop if axe already reports the same node.

No new engine. More errors from a package we already trust.

### 4. `linkinator` (or equivalent crawler) — site integrity

Not an accessibility scanner. RGAA 6 / 8 / 12 care about destinations.

- **Fills:** broken internal links, bad fragments, 4xx on preview routes. No current check does this.
- **Does not fill:** “link purpose is explicit” (heuristic / human).
- **Where:** site-level pass, same preview origin, SSRF-guarded.

### Optional later (not a second core engine)

| Package | Use if |
| --- | --- |
| `@siteimprove/alfa` | IBM trial is noisy or poorly mapped; Alfa is another ACT engine. Do not run IBM **and** Alfa. |
| `apca-w3` / `colorjs.io` | We need non-text or APCA contrast axe cannot compute. Keep axe 1.4.3/1.4.6 as baseline. |
| `@html-validate/wcag` | Never as a core engine — duplicates axe/AST. |

---

## Stop reinventing package rules

Rule: if axe, html-validate, jsx-a11y, or IBM already observe the **same fact**, delete our check. Custom code is only for behaviour, viewport/emulation, or RGAA facts no engine reports.

We already run axe + html-validate on the page, then run ~30 Playwright probes. Several of those probes re-scan markup those packages already scored.

### Runtime custom → delete in favor of a package

| Our check | Already covered by | Delete custom? |
| --- | --- | --- |
| `css-for-presentation` | html-validate `deprecated` + `no-deprecated-attr` (already enabled, same check id). axe `blink` / `marquee`. | **Yes. Duplicate of html-validate.** |
| `target-size` | axe `target-size` (2.5.8 + spacing). IBM `target_spacing_sufficient` (24px, inline, UA, spacing). | **Yes.** Set the Playwright viewport to 320×568 **before** axe/IBM if we still want the mobile pass. Do not keep a second geometry engine. |
| `text-spacing` (AST) | axe `avoid-inline-spacing`. IBM `text_spacing_valid`. Both flag `!important` on spacing. | **Yes** when runtime/axe ran. |
| `media-at-compatible` | axe `button-name` / `input-button-name` on unlabeled player chrome. | **Yes.** |
| `media-identification` | axe `object-alt` for `<object>`. | **Yes for object.** Canvas/embed with no name: keep one small custom or map `object-alt` only and accept the gap. |
| `info-not-color-only` | axe `link-in-text-block` (links distinguished by color). | **Yes.** Charts/required-fields-by-color stay human. Our `.error` class heuristic is not 1.4.1. |
| `focus-order-logical` | axe `focus-order-semantics` (experimental, currently unmapped). | **Yes.** Map the axe rule as `needs_review` if we want the signal. |
| `flash-threshold` | axe `blink` / `marquee` only. Nothing computes WCAG 2.3.1 flashes. | **Yes.** Our CSS-duration heuristic is not the criterion. |
| `form-error-association` (runtime, current) | html-validate `valid-for` / `no-missing-references` for broken `for` / `aria-describedby`. axe `label`. | **Yes for “id does not resolve”.** Keep Playwright only if we **submit** the form. |
| `both-colors` (runtime) | No engine. AST already flags unpaired inline `color`/`background`. Runtime only looks at inline styles again. | **Yes, runtime copy.** Keep AST until axe/IBM grow a 10.5 rule. |
| `announcement` | Does not prove live updates. Hidden nodes: axe `aria-hidden-*`. | **Yes** until we mutate the DOM and re-read the tree. |
| `hover-content` | Does not implement 1.4.13. Broken refs: html-validate `no-missing-references`. | **Yes** as written. Replace with a Playwright hover/focus/Escape flow later, not another scanner. |

IBM `style_focus_visible` is **not** a replacement for our Tab + focused-vs-unfocused compare. It only warns when CSS changed `outline`/`border`. Weaker than what we have — do not swap.

IBM `text_spacing_valid` / axe `avoid-inline-spacing` are **not** a replacement for injecting WCAG 1.4.12 spacing and looking for clip. That inject (`text-spacing-runtime`) is the real C36 test; keep it.

### Runtime custom → keep (no package does this)

| Check | Why it is not a package |
| --- | --- |
| `focus-visible`, trap, not-obscured, `focus-appearance` | Must Tab and compare computed styles / occlusion. |
| `dialog-focus` | Open → Tab → Escape → restore. |
| `reflow`, `resize-text` | Viewport + overflow with 2D exceptions. No IBM/axe auto-reflow. |
| `reduced-motion` (runtime) | Emulate `prefers-reduced-motion`, then see what still runs. |
| `forced-colors` | Condition-specific UI chrome. (Should emulate; today it infers from normal CSS.) |
| `non-text-contrast` | axe contrast is **text**. 1.4.11 UI components stay ours (or a dedicated contrast lib later, not a full scanner). |
| `css-disabled-content` | RGAA 10.2: meaning only in `::before`/`::after` / background images. |
| `css-off-understandable`, `layout-table-linearization` | RGAA 10.3 / 5.3: disable CSS or compare table linearization. |
| `css-hover-keyboard`, `media-keyboard` | Stylesheet `:hover` without `:focus`; Space on `<video controls>`. |
| `widget-keyboard` | Reachability of tab/menu/disclosure items. Weak vs full arrow-key tests, but **no scanner** does even this. Keep until we upgrade the flow; do not replace with jsx-a11y. |
| Site-level consistency | Cross-route. |
| Theme `browserConditions` | Same checks, different media. |
| Heuristics: captcha, error-prevention, accessible-auth, supplementary `title` | No engine. Keep as `needs_review` or delete if noisy — not replaceable. |

`label-adjacent` (48px visual gap): no package. Either keep as RGAA visual-label heuristic or delete as FP-prone — not “use IBM”.

### AST → delete or stop owning once jsx-a11y + axe run

These AST checks **reimplement** eslint-plugin-jsx-a11y and/or axe. After jsx-a11y is wired on the clone, and when runtime axe ran, **stop emitting** the AST twin (widen `filterAstFindingsForAuthority`).

| AST check | Package rule |
| --- | --- |
| `keyboard-interaction` | jsx-a11y `click-events-have-key-events`, `mouse-events-have-key-events`, `no-static-element-interactions`, `interactive-supports-focus` |
| `input-label` | jsx-a11y `label-has-associated-control` / `control-has-associated-label`; axe `label` |
| `img-alt` | jsx-a11y `alt-text`; axe `image-alt` |
| `anchor-name` | jsx-a11y `anchor-has-content`; axe `link-name` |
| `html-lang` | jsx-a11y `html-has-lang` / `lang`; axe `html-has-lang` |
| `iframe-title` | jsx-a11y `iframe-has-title`; axe `frame-title` |
| `no-accesskey` | jsx-a11y `no-access-key`; axe `accesskeys` |
| `no-autofocus` | jsx-a11y `no-autofocus` |
| `positive-tabindex` | jsx-a11y `tabindex-no-positive`; axe `tabindex` |
| `aria-props` / `aria-role` / `aria-required-attr` | jsx-a11y `aria-*` / `role-has-required-aria-props`; axe `aria-*` |
| `redundant-role` | jsx-a11y `no-redundant-roles` |
| `noninteractive-tabindex` | jsx-a11y `no-noninteractive-tabindex` |
| `aria-activedescendant` | jsx-a11y `aria-activedescendant-has-tabindex` |
| `empty-heading` | jsx-a11y `heading-has-content`; axe `empty-heading` |
| `autocomplete-valid` | jsx-a11y `autocomplete-valid`; axe `autocomplete-valid` |
| `no-blink-marquee` | jsx-a11y `no-distracting-elements`; axe `blink` / `marquee` |
| `video-caption` | jsx-a11y `media-has-caption`; axe `video-caption` |
| `aria-hidden-focusable` | jsx-a11y `no-aria-hidden-on-focusable`; axe `aria-hidden-focus` |
| `th-scope` | jsx-a11y `scope`; axe `scope-attr-valid` |
| `duplicate-id` | axe + html-validate `no-dup-id` (keep AST only for CI without preview) |
| `outline-none` | **Delete.** Runtime `focus-visible` is the real check. |
| `reduced-motion` (AST) | **Delete.** Runtime emulation is the real check. |
| `meta-viewport` / `no-auto-refresh` | axe `meta-viewport*`, `meta-refresh*` when runtime ran |

Keep AST **without** a package twin: heuristics (`sensory-characteristics`, `link-explicit-heuristic`, `lang-change`, …), `dragging` / pointer / motion actuation (source event names), `office-docs-alt-present`, `fieldset-legend` / `field-grouping` patterns jsx-a11y does not fully cover.

Do **not** add `@html-validate/wcag`: it would clone axe/jsx-a11y a third time.

### Mapping that hides distinct defects

| Observation | Mapped to | Effect |
| --- | --- | --- |
| `complyloop-forced-colors` | `non-text-contrast` | Forced-colors failures look like 1.4.11 contrast. |
| Dialog / tabs / disclosure / menu | `keyboard-interaction` or `keyboard-trap` | Cannot status widget families separately. |
| Several axe rules | one check id (e.g. many image rules → `img-alt`) | Correct for **one finding**; do not also emit a second engine’s copy. |

### axe used incompletely (more errors, same package)

1. Persist `incomplete` (especially `color-contrast`) as **needs_review**, not silence.
2. Audit same-origin iframes (or record `unable_to_verify` for `frame-keyboard`).
3. Map or explicitly reject the 7 unmapped rules — today they vanish.
4. When runtime ran, drop AST for **all** ids axe/html-validate also own, not only the composition-sensitive list.

---

## Manual / pertinence controls (21 `checkId: null`)

Alt quality, caption quality, label pertinence, sitemap pertinence, button names in context, etc. **No scanner should auto-fail these.** A second engine that guesses “alt is bad” would be worse than silence. Human verification stays the method.

---

## What to do next

**Already done:** jsx-a11y on the clone; deleted AST twins for mapped plugin rules; deleted custom `css-for-presentation`, `target-size` geometry, runtime `both-colors`, `focus-order-logical` (axe `focus-order-semantics` is mapped). Theme pass uses axe rule id `link-in-text-block`.

**Still open**

1. Keep `info-not-color-only` (charts / required-by-color) unless we accept axe `link-in-text-block` as the only 1.4.1 signal. `media-at-compatible`, `flash-threshold`, `announcement`, `hover-content` stay until a package covers the same behaviour.
2. Widen AST-drop when runtime ran so axe/html-validate twins do not double-file (`img-alt`, ARIA, lists, …).
3. axe `incomplete` → `needs_review`; map or drop the 7 unmapped rules.
4. html-validate `valid-for` / `no-missing-references`.
5. Optional: IBM mapped subset — not a second target-size engine.

**Keep writing Playwright only where engines stop**

6. Focus Tab/compare, trap, dialog restore, reflow, 200% text, reduced-motion emulate, forced-colors, 1.4.12 spacing **inject**, 1.4.11 non-text, CSS-off / layout-table, media Space, site-level. `linkinator` still not added.

**Do not** add Lighthouse, Pa11y, QualWeb+IBM+Alfa together, or `@html-validate/wcag`.

---

## Summary

We reinvented wheels axe, html-validate, and jsx-a11y already turn: presentation markup, target size, object names, player button names, color-only links, experimental focus-order, blink, and most JSX label/ARIA/name rules.

Custom Playwright should shrink to **interaction + conditions + RGAA-only structure** (CSS off, 10.2 generated content, 1.4.11, 1.4.12 inject). jsx-a11y should replace the overlapping AST set. IBM is optional for 2.5.8/ACT extras — not a reason to keep our target-size clone.

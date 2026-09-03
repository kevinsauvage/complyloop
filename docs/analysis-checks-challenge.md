# Analysis checks — challenge

How we analyze **today**, whether each layer is the right tool, and **which extra npm packages would still report more real defects**. Implementation details stay in [`docs/ai/architecture.md`](./ai/architecture.md). Decisions on what to build stay in [`docs/analysis-strategy.md`](./analysis-strategy.md).

## How we analyze today

| Layer                   | What actually runs                                                                                                                                                                                                                                                                                          | Verdict                                                                                                                                                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source                  | Custom AST in `checks/` plus mapped `eslint-plugin-jsx-a11y` (`jsx-a11y-scan.ts`). Used by `complyloop-check` and assessments.                                                                                                                                                                              | Right for CI without a preview. Wrong as the **verdict** for CSS, focus, generated DOM, widgets. Do not add an AST twin for a mapped jsx-a11y rule. `control-has-associated-label` stays off (`htmlFor`/`id` false positives); AST `input-label` remains. |
| axe-core (`axe.min.js`) | `axe.run(document, { iframes: true })`. Violations fail. Incomplete (e.g. `color-contrast`) → `warning` → requirement `needs_review`. `frame-tested` → `frame-keyboard` as `needs_review`. Target size is axe `target-size` (desktop). `link-in-text-block` → `use-of-color` (theme pass uses that axe id). | Right **baseline**.                                                                                                                                                                                                                                       |
| html-validate           | Curated rules on serialized generated DOM: RGAA 8.2 / 10.1 plus `no-missing-references` (`for` / aria idrefs → `form-error-association`).                                                                                                                                                                   | Right tool. `valid-for` does not fire on missing targets here (covered by `no-missing-references`).                                                                                                                                                       |
| Playwright custom       | Interaction / emulation after axe (`complyloop-*`).                                                                                                                                                                                                                                                         | Keep behaviour, viewport, conditions, RGAA facts no engine reports.                                                                                                                                                                                       |
| Site-level              | ≥2 preview routes: nav, labels, help, sitemap, search, landmarks, duplicate titles.                                                                                                                                                                                                                         | Right tool. Unique vs any page scanner.                                                                                                                                                                                                                   |
| Theme pass              | Re-runs a subset under dark / light / `prefers-contrast: more`.                                                                                                                                                                                                                                             | Right idea.                                                                                                                                                                                                                                               |

**CI without `runtimeBaseUrl`:** source only. Most runtime-only controls stay `unable_to_verify`. That is the largest reporting gap — not “too few scanners”.

**Merge:** when runtime ran, source findings are dropped for composition-sensitive, runtime-only, and package-twin ids (`isPackageTwinSourceCheck`: names, ARIA, captions, blink, viewport, lists, keyboard, lang, iframe, …). CI without a preview still emits those source findings.

**axe rules we never emit:** `aria-text`, `aria-treeitem-name`, `landmark-complementary-is-top-level` (`REJECTED_AXE_RULES`).

---

## Do not add another axe wrapper

These packages would **not** increase independent coverage. They run axe (or a thinner static copy):

`pa11y`, Lighthouse accessibility, `@axe-core/playwright`, `jest-axe` / `vitest-axe`, WAVE/Tenon-style services, `@probeo/fast-a11y`.

`@axe-core/playwright` stays skipped: webpack rewrites axe `source`; disk `axe.min.js` is the correct adapter.

Do **not** add `@html-validate/wcag`: it clones axe/jsx-a11y a third time.

### Optional later (not a second core engine)

| Package                  | Use if                                                                          |
| ------------------------ | ------------------------------------------------------------------------------- |
| `@siteimprove/alfa`      | IBM trial is noisy; do not run IBM **and** Alfa.                                |
| `apca-w3` / `colorjs.io` | Non-text or APCA contrast axe cannot compute. Keep axe 1.4.3/1.4.6 as baseline. |

---

## Custom checks we keep (no package does this)

Rule: if axe, html-validate, or jsx-a11y already observe the **same fact**, we do not keep a custom twin. Custom code is only for behaviour, viewport/emulation, or RGAA facts no engine reports.

| Check                                                                                                                                                                              | Why it stays                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `focus-visible`, trap, not-obscured, `focus-appearance`                                                                                                                            | Tab and compare computed styles / occlusion.                                     |
| `dialog-focus`                                                                                                                                                                     | Open → Tab → Escape → restore.                                                   |
| `reflow`, `resize-text`                                                                                                                                                            | Viewport + overflow with 2D exceptions.                                          |
| `text-spacing-runtime`                                                                                                                                                             | Inject WCAG 1.4.12 spacing and look for clip. Not axe `avoid-inline-spacing`.    |
| `reduced-motion` (runtime)                                                                                                                                                         | Emulate `prefers-reduced-motion`, then see what still runs.                      |
| `forced-colors`                                                                                                                                                                    | Condition-specific UI chrome. (Should emulate; today it infers from normal CSS.) |
| `non-text-contrast`                                                                                                                                                                | axe contrast is **text**. 1.4.11 UI chrome stays ours.                           |
| `css-disabled-content`                                                                                                                                                             | RGAA 10.2: meaning only in `::before`/`::after` / background images.             |
| `css-off-understandable`, `layout-table-linearization`                                                                                                                             | RGAA 10.3 / 5.3.                                                                 |
| `css-hover-keyboard`, `media-keyboard`                                                                                                                                             | `:hover` without `:focus`; Space on `<video controls>`.                          |
| `widget-keyboard`                                                                                                                                                                  | Reachability of tab/menu/disclosure items.                                       |
| `media-identification`                                                                                                                                                             | Nameless **canvas/embed** only. `<object>` is axe `object-alt`.                  |
| Site-level + theme `browserConditions`                                                                                                                                             | Cross-route / different media.                                                   |
| Heuristics: captcha, error-prevention, accessible-auth, supplementary `title`                                                                                                      | No engine. Keep as `needs_review` or delete if noisy.                            |
| `label-adjacent`                                                                                                                                                                   | 48px visual-gap heuristic. Keep or delete as FP-prone — not “use IBM”.           |
| AST `both-colors`                                                                                                                                                                  | Until a package owns RGAA 10.5.                                                  |
| AST `button-name`                                                                                                                                                                  | jsx-a11y `button-has-content` is not mapped.                                     |
| AST heuristics (`sensory-characteristics`, `link-explicit-heuristic`, `lang-change`, dragging / pointer / motion, `office-docs-alt-present`, `fieldset-legend` / `field-grouping`) | No package twin.                                                                 |

Do **not** re-add CSS heuristics for 1.4.13 hover, live-region _updates_, or WCAG 2.3.1 flashes. Those catalog rows are `checkId: null` (manual) until a real probe exists — they must not auto-pass after a Playwright run.

IBM `style_focus_visible` is not a replacement for Tab + focused-vs-unfocused compare.

---

## Mapping that hides distinct defects

| Observation                       | Mapped to                                        | Effect                                                                |
| --------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------- |
| `complyloop-forced-colors`        | `non-text-contrast`                              | Forced-colors failures look like 1.4.11 contrast.                     |
| Dialog / tabs / disclosure / menu | `keyboard-interaction` or `keyboard-trap`        | Cannot status widget families separately.                             |
| Several axe rules                 | one check id (e.g. many image rules → `img-alt`) | Correct for **one finding**; do not also emit a second engine’s copy. |

---

## Manual / pertinence controls (26 `checkId: null`)

Alt quality, caption quality, label pertinence, sitemap pertinence, button names in context, plus criteria we do not scan: source `outline-none` pairing, 1.4.13 hover/focus content, 1.4.1 color-only information, 2.3.1 flash, RGAA 4.13 AT-compatible media players. **No scanner should auto-fail or auto-pass these.** Human verification stays the method.

---

## What to do next

1. Axe at 320×568 if we want a mobile target-size pass.
2. Later Playwright, not another scanner: form **submit** → associated errors; hover/focus/Escape (1.4.13); mutate DOM + re-read live regions; flash _if_ we ever compute 2.3.1. Emulate `forced-colors` instead of inferring from normal CSS.

**Do not** add Lighthouse, Pa11y, QualWeb+IBM+Alfa together, or `@html-validate/wcag`.

# Analysis checks — challenge

How we analyze **today**, what the engine inventory looks like after the latest work, and **what to build next** (by priority). Implementation detail: [`docs/ai/architecture.md`](./ai/architecture.md). Decision rules: [`docs/analysis-strategy.md`](./analysis-strategy.md).

---

## Engine inventory (current)

| Layer              | Module(s)                                          | Scale                                                      | Role                                                                                              |
| ------------------ | -------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Source AST         | `checks/` + `registry.ts`                          | **58** custom checks                                       | React/TSX patterns jsx-a11y cannot see (CAPTCHA cues, pointer gestures, office-doc links, …)      |
| jsx-a11y           | `jsx-a11y-scan.ts`, `jsx-a11y-map.ts`              | **28** mapped rules                                        | CI source twin; `control-has-associated-label` stays **off** (htmlFor/id false positives)         |
| axe-core           | `runtime/scan.ts`, `axe-map.ts`                    | **123** mapped rules                                       | Rendered a11y tree baseline; incomplete → `warning` / `needs_review`                              |
| html-validate      | `html-validate-runtime.ts`, `html-validate-map.ts` | **7** rendered rules                                       | Generated DOM structure (RGAA 8.2 markup + 10.1 presentation — not duplicate ids, landmarks, or idrefs) |
| IBM Equal Access   | `ibm-runtime.ts`, `ibm-map.ts`                     | **15** curated rules (~174 engine rules rejected/unmapped) | Second engine on same Playwright page; dedupes vs axe by check id + snippet                       |
| Playwright custom  | `runtime/custom-checks/`                           | **26** probes                                              | Focus, reflow, widgets, hover content, live regions, form submit, 44×44 target size, …            |
| Theme pass         | `theme-conditions.ts`                              | 3 conditions                                               | Re-runs theme-sensitive axe + focus/contrast subset under dark / light / `prefers-contrast: more` |
| Target-size conditions | `viewport-conditions.ts` + `scan.ts`           | 3 conditions (default, `320×568`, `pointer: coarse`)       | Re-runs axe `target-size` (24×24); AAA 44×44 is a separate custom check                           |

**Catalog:** 156 catalog controls — **130** automated (`checkId` set), **26** manual (`checkId: null`, pertinence/quality/flash/AT-compatible media). **130** distinct `CheckId` values in `types.ts`.

**Merge:** when runtime ran, AST findings drop for composition-sensitive, runtime-only, and package-twin ids (`check-authority.ts`). CI without preview keeps those source findings.

**Rejected axe rules:** `aria-text`, `aria-treeitem-name`, `landmark-complementary-is-top-level`.

**Rejected IBM rules (sample):** `style_focus_visible`, `target_spacing_sufficient`, `text_contrast_sufficient*`, `img_alt_*`, `element_id_unique`, `html_skipnav_exists`, `input_label_visible`, `aria_accessiblename_exists`, `page_title_valid`, `a_text_purpose` — no second focus/target-size engine; no axe duplicates.

---

## How we analyze today

| Layer             | What runs                                                   | Verdict                                                                                                   |
| ----------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Source            | AST + jsx-a11y                                              | Right for CI without preview. Wrong as **verdict** for CSS, focus, generated DOM, widgets.                |
| axe               | `axe.run(document, { iframes: true })` on disk `axe.min.js` | Right baseline. Target size at default viewport **plus** `320×568` and `pointer: coarse` condition passes. |
| html-validate     | Serialized generated DOM                                    | Right tool for RGAA 8.2 / 10.1 structural evidence only.                                                  |
| IBM               | `getCompliance(page)` after axe, mapped subset              | Right as **sibling** engine; heuristic ids emit `warning`; check-id dedupe vs axe.                        |
| Custom Playwright | Tab, viewport emulation, widget interaction                 | Right for behaviour no static engine sees. **forced-colors** uses live `forced-colors: active` emulation. |
| Site-level        | Snapshots across routes                                     | Right differentiator; needs ≥2 routes.                                                                    |
| linkinator        | Per-route, same-origin, optional `recurse`, SSRF-guarded    | Same-origin crawl capped by `maxRuntimePages()`; fragment `#id` targets validated from snapshots.         |
| Theme pass        | Condition-specific re-run                                   | Right idea; subset is intentionally narrow.                                                               |

**Largest product gap:** assessments **without** `runtimeBaseUrl` — **88** runtime-only check ids (including contrast, focus, reflow, broken links, site-level subset) stay `unable_to_verify`. That is a preview-URL adoption problem more than a missing-scanner problem.

**Do not add:** Lighthouse, Pa11y, `@axe-core/playwright`, `@html-validate/wcag`, or IBM **and** Alfa together.

---

## Known weaknesses (from code review)

| Issue                        | Where                                                 | Effect                                                                       |
| ---------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| Custom check test gap        | ~17/25 `custom-checks/*.ts` lack colocated unit tests | Behaviour still partly covered by `custom-checks-playwright.test.ts` only    |
| accessibility-checker weight | npm dep pulls puppeteer/chromedriver                  | Runtime-only via dynamic import + `serverExternalPackages`; ops/install cost |

---

## Mapping that hides distinct defects

| Observation                | Mapped to           | Effect                                                  |
| -------------------------- | ------------------- | ------------------------------------------------------- |
| Many axe image rules       | `img-alt`           | Correct for one finding per defect; dedupe with IBM/AST |

---

## Manual controls — never auto-pass or auto-fail (26 `checkId: null`)

Pertinence/quality: alt text, captions, labels, titles, button names, table summaries, sitemap entries, office-doc equivalence, …
Not scanned: outline-none pairing, **1.4.1** color-only information, **2.3.1** flash, **RGAA 4.13** AT-compatible media players.

Human verification remains the method for these.

---

## Prioritized todo list

## Custom checks we keep (no package twin)

Rule: if axe, html-validate, jsx-a11y, or IBM already observe the **same fact** on the rendered DOM, do not keep a custom twin. Custom code = behaviour, viewport/emulation, or RGAA facts no engine reports.

| Area                | Modules                                                                         | Why it stays                              |
| ------------------- | ------------------------------------------------------------------------------- | ----------------------------------------- |
| Focus               | `focus.ts`, `focus-indicator.ts`                                                | Tab + compare computed styles / occlusion |
| Widgets             | `dialog-focus.ts`, `widget-keyboard.ts`                                         | Open → operate → Escape → restore         |
| Viewport            | `reflow.ts`, `resize-text.ts`, `reflow-exceptions.ts`                           | 320×568 + 2D exceptions                   |
| Spacing             | `text-spacing-runtime.ts`                                                       | Inject WCAG 1.4.12 spacing                |
| Motion / conditions | `reduced-motion.ts`, `forced-colors.ts`, `form-error-submit.ts`                 | Emulation + submit-time validation        |
| Contrast            | `non-text-contrast.ts`                                                          | 1.4.11 UI chrome in default / hover / selected (axe = text; disabled skipped) |
| Target size AAA     | `target-size-enhanced.ts`                                                       | 44×44; axe owns 24×24 AA                                                      |
| CSS meaning         | `css-disabled-content.ts`, `css-off-understandable.ts`, `css-hover-keyboard.ts` | RGAA 10.2 / 10.3 / hover keyboard         |
| Media               | `media-keyboard.ts`, `media-identification.ts`                                  | Space on video; nameless canvas/embed     |
| Tables              | `layout-table-linearization.ts`                                                 | RGAA 5.3 layout tables                    |
| Heuristics          | captcha, error-prevention, accessible-auth, supplementary `title`               | No engine; runtime or `needs_review`      |
| AST-only            | `button-name` (jsx-a11y gap), `both-colors`, pointer/dragging/motion heuristics | No package twin                           |

---

## Success metrics

Good progress on this list looks like:

- Preview assessments: IBM adds **actionable, non-duplicate** findings on real apps (not heuristic false fails).
- Broken links caught on configured routes without SSRF regressions.
- Behaviour probes (submit, hover content, live regions) produce **defensible** dom locations and `needs_review` where appropriate.
- CI-only projects: unchanged — still honest `unable_to_verify` for runtime-only controls.

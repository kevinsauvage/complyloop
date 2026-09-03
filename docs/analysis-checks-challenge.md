# Analysis checks — challenge

How we analyze **today**, what the engine inventory looks like after the latest work, and **what to build next** (by priority). Implementation detail: [`docs/ai/architecture.md`](./ai/architecture.md). Decision rules: [`docs/analysis-strategy.md`](./analysis-strategy.md).

---

## Engine inventory (current)

| Layer              | Module(s)                                          | Scale                                                      | Role                                                                                              |
| ------------------ | -------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Source AST         | `checks/` + `registry.ts`                          | **58** custom checks                                       | React/TSX patterns jsx-a11y cannot see (CAPTCHA cues, pointer gestures, office-doc links, …)      |
| jsx-a11y           | `jsx-a11y-scan.ts`, `jsx-a11y-map.ts`              | **28** mapped rules                                        | CI source twin; `control-has-associated-label` stays **off** (htmlFor/id false positives)         |
| axe-core           | `runtime/scan.ts`, `axe-map.ts`                    | **122** mapped rules                                       | Rendered a11y tree baseline; incomplete → `warning` / `needs_review`                              |
| html-validate      | `html-validate-runtime.ts`, `html-validate-map.ts` | **10** rendered rules                                      | Generated DOM structure (RGAA 8.2 / 10.1, idrefs)                                                 |
| IBM Equal Access   | `ibm-runtime.ts`, `ibm-map.ts`                     | **15** curated rules (~174 engine rules rejected/unmapped) | Second engine on same Playwright page; dedupes vs axe by check id + snippet                       |
| Playwright custom  | `runtime/custom-checks/`                           | **25** probes                                              | Focus, reflow, widgets, hover content, live regions, form submit, …                               |
| Theme pass         | `theme-conditions.ts`                              | 3 conditions                                               | Re-runs theme-sensitive axe + focus/contrast subset under dark / light / `prefers-contrast: more` |
| Mobile target-size | `viewport-conditions.ts` + `scan.ts`               | 1 condition (`320×568`)                                    | Re-runs axe `target-size`; condition-specific findings like theme pass                            |

**Catalog:** 154 RGAA controls — **128** automated (`checkId` set), **26** manual (`checkId: null`, pertinence/quality/flash/AT-compatible media). **128** distinct `CheckId` values in `types.ts`.

**Merge:** when runtime ran, AST findings drop for composition-sensitive, runtime-only, and package-twin ids (`check-authority.ts`). CI without preview keeps those source findings.

**Rejected axe rules:** `aria-text`, `aria-treeitem-name`, `landmark-complementary-is-top-level`.

**Rejected IBM rules (sample):** `style_focus_visible`, `target_spacing_sufficient`, `text_contrast_sufficient*`, `img_alt_*`, `element_id_unique`, `html_skipnav_exists`, `input_label_visible`, `aria_accessiblename_exists`, `page_title_valid`, `a_text_purpose` — no second focus/target-size engine; no axe duplicates.

---

## How we analyze today

| Layer             | What runs                                                   | Verdict                                                                                                   |
| ----------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Source            | AST + jsx-a11y                                              | Right for CI without preview. Wrong as **verdict** for CSS, focus, generated DOM, widgets.                |
| axe               | `axe.run(document, { iframes: true })` on disk `axe.min.js` | Right baseline. Target size at default viewport **plus** `320×568` condition pass.                        |
| html-validate     | Serialized generated DOM                                    | Right tool for markup validity and broken idrefs.                                                         |
| IBM               | `getCompliance(page)` after axe, mapped subset              | Right as **sibling** engine; heuristic ids emit `warning`; check-id dedupe vs axe.                        |
| Custom Playwright | Tab, viewport emulation, widget interaction                 | Right for behaviour no static engine sees. **forced-colors** uses live `forced-colors: active` emulation. |
| Site-level        | Snapshots across routes                                     | Right differentiator; needs ≥2 routes.                                                                    |
| linkinator        | Per-route, same-origin, optional `recurse`, SSRF-guarded    | Same-origin crawl capped by `maxRuntimePages()`; fragment `#id` targets validated from snapshots.         |
| Theme pass        | Condition-specific re-run                                   | Right idea; subset is intentionally narrow.                                                               |

**Largest product gap:** assessments **without** `runtimeBaseUrl` — **86** runtime-only check ids (including contrast, focus, reflow, broken links, site-level subset) stay `unable_to_verify`. That is a preview-URL adoption problem more than a missing-scanner problem.

**Do not add:** Lighthouse, Pa11y, `@axe-core/playwright`, `@html-validate/wcag`, or IBM **and** Alfa together.

---

## Known weaknesses (from code review)

| Issue                        | Where                                                | Effect                                                                       |
| ---------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| Custom check test gap        | 22/25 `custom-checks/*.ts` lack colocated unit tests | Behaviour covered partly by `custom-checks-playwright.test.ts` only          |
| `label-adjacent`             | 48px gap heuristic                                   | Documented as FP-prone; still emits high-confidence violations               |
| accessibility-checker weight | npm dep pulls puppeteer/chromedriver                 | Runtime-only via dynamic import + `serverExternalPackages`; ops/install cost |

---

## Mapping that hides distinct defects

| Observation                | Mapped to           | Effect                                                  |
| -------------------------- | ------------------- | ------------------------------------------------------- |
| `complyloop-forced-colors` | `non-text-contrast` | Forced-colors failures look like 1.4.11 contrast        |
| Many axe image rules       | `img-alt`           | Correct for one finding per defect; dedupe with IBM/AST |

---

## Manual controls — never auto-pass or auto-fail (26 `checkId: null`)

Pertinence/quality: alt text, captions, labels, titles, button names, table summaries, sitemap entries, office-doc equivalence, …
Not scanned: outline-none pairing, **1.4.1** color-only information, **2.3.1** flash, **RGAA 4.13** AT-compatible media players.

Human verification remains the method for these.

---

## Prioritized todo list

### P2 — Coverage extensions (still no third core engine) ✅ (done)

6. ~~**Hover / focus / Escape (WCAG 1.4.13)**~~ — `hover-content.ts` + `ctl-hover-content` → `hover-content` (heuristic warning).
7. ~~**Live region updates**~~ — `live-region-updates.ts` triggers actions and flags unannounced status text.
8. ~~**linkinator hardening**~~ — optional same-origin `recurse: true` capped by `maxRuntimePages()`; fragment targets validated from snapshots → `broken-link`.
9. ~~**Split widget keyboard check ids**~~ — `dialog-keyboard`, `tabs-keyboard`, `disclosure-keyboard`, `menu-keyboard` in axe-map + catalog.
10. ~~**Fragment / duplicate-id across routes**~~ — snapshot collects ids/lang/h1; site-level `duplicate-id`, `consistent-lang`, `consistent-page-heading`.

### P3 — Quality, ops, and debt

11. **Colocated unit tests** for custom checks currently only covered by Playwright integration (`focus.ts`, `widget-keyboard.ts`, `reflow.ts`, `non-text-contrast.ts`, …).

12. **Re-evaluate `label-adjacent`** — Keep as `needs_review`, tighten heuristic, or remove if FP rate is high on real apps.

### P4 — Later / optional packages

15. **Flash threshold (2.3.1)** — Only if we implement luminance sampling; stays manual until then.
16. **`apca-w3` / `colorjs.io`** — Non-text or APCA where axe cannot; keep 1.4.3/1.4.6 baseline.
17. **`@siteimprove/alfa`** — Only if IBM trial fails; never IBM + Alfa together.

### Do not do

- Another axe wrapper (Pa11y, Lighthouse, `@axe-core/playwright`).
- `@html-validate/wcag` (third copy of axe/jsx-a11y).
- CSS/style linters as compliance engines.
- Re-add deleted CSS heuristics for 1.4.13 hover, live-region _presence_, or 2.3.1 flash as auto-pass after Playwright.
- Auto-pass/fail the 26 pertinence/manual controls.

---

## Custom checks we keep (no package twin)

Rule: if axe, html-validate, jsx-a11y, or IBM already observe the **same fact** on the rendered DOM, do not keep a custom twin. Custom code = behaviour, viewport/emulation, or RGAA facts no engine reports.

| Area                | Modules                                                                         | Why it stays                              |
| ------------------- | ------------------------------------------------------------------------------- | ----------------------------------------- |
| Focus               | `focus.ts`, `focus-indicator.ts`                                                | Tab + compare computed styles / occlusion |
| Widgets             | `dialog-focus.ts`, `widget-keyboard.ts`                                         | Open → operate → Escape → restore         |
| Viewport            | `reflow.ts`, `resize-text.ts`, `reflow-exceptions.ts`                           | 320×568 + 2D exceptions                   |
| Spacing             | `text-spacing-runtime.ts`                                                       | Inject WCAG 1.4.12 spacing                |
| Motion / conditions | `reduced-motion.ts`, `forced-colors.ts`, `form-error-submit.ts`                 | Emulation + submit-time validation        |
| Contrast            | `non-text-contrast.ts`                                                          | 1.4.11 UI chrome (axe = text)             |
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

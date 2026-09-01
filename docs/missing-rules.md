# Missing RGAA / WCAG rules

Coverage gap for the accessibility MVP. Goal: cover **as many RGAA 4.1.2 and WCAG 2.2 A/AA rules as we can score honestly** — automated when the engine can fail/pass with evidence, human-reviewed (`checkId: null`) when it cannot.

This is the backlog for **gaps only**. Shipped controls and checks are inventoried in [Implemented coverage](#implemented-coverage). System shape: [`docs/ai/architecture.md`](./ai/architecture.md).

**Sources:** RGAA 4.1.2 (DINUM, 106 criteria / 13 themes), WCAG 2.2 (W3C), catalog in `src/adapters/rgaa/controls.ts`, AST registry in `src/analysis/checks/registry.ts`, axe map in `src/analysis/runtime/axe-map.ts` (axe-core 4.13, 105 rules), custom Playwright checks in `src/analysis/runtime/custom-checks/`.

When a row is implemented, remove it from the open backlog here, add it to [Implemented coverage](#implemented-coverage), and update the architecture check list.

---

## Snapshot (2026-09-01, P2 remainder shipped)

| Surface | Count | What it means |
| --- | ---: | --- |
| Catalog controls | 96 | 86 automated + 10 human-reviewed (`checkId: null`). Still not the full referential. |
| Unique WCAG SCs in the catalog | 50 | Several controls share `4.1.2`, `1.3.1`, or `2.4.7`. |
| Unique official RGAA criteria we approximate | ~50 of 106 | Many older catalog `code` values are still wrong (see [Mapping debt](#mapping-debt)). |
| `CheckId` values | 86 | One per automated control. |
| AST checks | 59 | CI / `complyloop-check` source of truth (`registry.ts`). |
| Runtime-only checks | 27 | axe + custom Playwright; `unable_to_verify` without a preview URL. |
| Composition-sensitive checks | 8 | AST runs in CI; runtime owns status when `runtimeBaseUrl` is set. |
| axe rules mapped | 91 | Includes 9 `complyloop-*` synthetic ids. |
| Human-only controls (`checkId: null`) | 10 | Pertinence/quality slots; never auto-passed. |
| WCAG 2.2 A+AA | 56 | Legal target (EAA / most contracts). AAA is out of MVP. |
| RGAA 4.1.2 | 106 | French operationalization of WCAG 2.1 A+AA. RGAA 5 (WCAG 2.2) is expected late 2026. |

Presence ≠ relevance. `img-alt` can prove an `alt` exists; it cannot prove the alternative is **pertinent** (RGAA 1.3). Do not auto-pass relevance criteria from a presence check.

---

## Implemented coverage

### Engine authority

| Authority | Count | When it applies |
| --- | ---: | --- |
| **AST** (`registry.ts`) | 59 | Local scan, CI (`complyloop-check`). Always runs. |
| **Runtime-only** (`check-authority.ts`) | 27 | Playwright + axe and/or `custom-checks/`. Needs `runtimeBaseUrl`. |
| **Composition-sensitive** | 8 | AST + runtime; runtime wins when it ran. |
| **Human** (`checkId: null`) | 10 | Never auto-passed. |

### AST checks (59)

| Theme | `checkId` | Catalog control |
| --- | --- | --- |
| Images / figures | `img-alt`, `svg-name`, `figure-caption`, `image-of-text` | `ctl-img-alt`, `ctl-svg-name`, `ctl-figure-caption`, `ctl-image-of-text` |
| Names | `button-name`, `anchor-name`, `input-label`, `dialog-name`, `tab-name`, `summary-name` | `ctl-button-name`, `ctl-link-name`, `ctl-input-label`, `ctl-dialog-name`, `ctl-tab-name`, `ctl-summary-name` |
| Language | `html-lang` | `ctl-html-lang` |
| Focus / keyboard | `positive-tabindex`, `no-autofocus`, `keyboard-interaction`, `noninteractive-tabindex`, `aria-activedescendant`, `no-accesskey` | `ctl-focus-order`, `ctl-no-autofocus`, `ctl-keyboard-interaction`, `ctl-noninteractive-tabindex`, `ctl-aria-activedescendant`, `ctl-no-accesskey` |
| Frames / media | `iframe-title`, `autoplay-media`, `video-caption`, `audio-caption`, `no-blink-marquee` | `ctl-iframe-title`, `ctl-autoplay-media`, `ctl-video-caption`, `ctl-audio-caption`, `ctl-no-blink-marquee` |
| Structure | `heading-order`, `empty-heading`, `list-structure`, `p-as-heading`, `blockquote-cite`, `dir-change` | `ctl-heading-order`, `ctl-empty-heading`, `ctl-list-structure`, `ctl-p-as-heading`, `ctl-blockquote-cite`, `ctl-dir-change` |
| Tables | `empty-th`, `table-caption`, `th-scope`, `layout-table-markup` | `ctl-empty-th`, `ctl-table-caption`, `ctl-th-scope`, `ctl-layout-table-markup` |
| Forms | `form-error-association`, `fieldset-legend`, `autocomplete-valid`, `autocomplete-purpose`, `optgroup`, `accessible-auth`, `status-live`, `redundant-entry` | `ctl-form-error-association`, `ctl-fieldset-legend`, `ctl-autocomplete-valid`, `ctl-autocomplete-purpose`, `ctl-optgroup`, `ctl-accessible-auth`, `ctl-status-live`, `ctl-redundant-entry` |
| ARIA | `aria-hidden-focusable`, `aria-role`, `aria-props`, `aria-required-attr`, `redundant-role` | `ctl-aria-hidden-focusable`, `ctl-aria-role`, `ctl-aria-props`, `ctl-aria-required-attr`, `ctl-redundant-role` |
| IDs | `duplicate-id` | `ctl-duplicate-id` |
| Zoom / spacing | `meta-viewport`, `text-spacing` | `ctl-meta-viewport`, `ctl-text-spacing` |
| Pointer / motion | `pointer-gesture`, `pointer-cancellation`, `motion-actuation`, `dragging` | `ctl-pointer-gesture`, `ctl-pointer-cancellation`, `ctl-motion-actuation`, `ctl-dragging` |
| Context change | `focus-context-change`, `input-context-change` | `ctl-focus-context-change`, `ctl-input-context-change` |
| Sensory / color (source) | `sensory-characteristics`, `outline-none`, `both-colors` | `ctl-sensory-characteristics`, `ctl-outline-none`, `ctl-both-colors` |
| Errors | `error-suggestion` | `ctl-error-suggestion` |
| Consultation | `new-window-onload` | `ctl-new-window-onload` |

### Runtime-only checks (27)

| Source | `checkId` | Catalog control |
| --- | --- | --- |
| axe | `color-contrast`, `use-of-color`, `document-title`, `bypass`, `landmark-one-main`, `landmark-unique`, `nested-interactive`, `target-size`, `table-headers`, `page-heading`, `content-region`, `label-in-name`, `lang-parts`, `aria-roledescription`, `presentation-role`, `no-auto-refresh`, `no-orientation-lock`, `frame-keyboard` | matching `ctl-*` |
| Playwright synthetic | `doctype` | `ctl-doctype` |
| `custom-checks/` | `focus-visible`, `keyboard-trap`, `focus-not-obscured`, `reflow`, `text-spacing-runtime`, `non-text-contrast`, `label-adjacent`, `hover-content` | matching `ctl-*` |

`both-colors` also has an AST twin for inline styles; runtime checks rendered inline color/background pairing.

### Composition-sensitive (8)

AST runs in CI; runtime DOM results own status when `runtimeBaseUrl` is set:

`input-label`, `button-name`, `anchor-name`, `form-error-association`, `heading-order`, `empty-heading`, `aria-hidden-focusable`, `duplicate-id`

### Human-only controls (10)

| Control id | RGAA | WCAG |
| --- | --- | --- |
| `ctl-img-alt-relevant` | 1.3 | 1.1.1 |
| `ctl-decorative-ignored` | 1.2 | 1.1.1 |
| `ctl-frame-title-relevant` | 2.2 | 4.1.2 |
| `ctl-page-title-relevant` | 8.6 | 2.4.2 |
| `ctl-link-explicit` | 6.1 | 2.4.4 |
| `ctl-label-relevant` | 11.2 | 3.3.2 |
| `ctl-captions-relevant` | 4.4 | 1.2.2 |
| `ctl-focus-order-logical` | 12.8 | 2.4.3 |
| `ctl-error-prevention` | 11.12 | 3.3.4 AA |
| `ctl-consistent-help` | — | 3.2.6 A |

`ctl-color-not-only` was skipped: `use-of-color` covers the automated slice of RGAA 3.2 / WCAG 1.4.1.

### WCAG 2.2 A/AA SCs with catalog coverage (50)

`1.1.1`, `1.2.1`, `1.2.2`, `1.3.1`, `1.3.2`, `1.3.3`, `1.3.4`, `1.3.5`, `1.4.1`, `1.4.2`, `1.4.3`, `1.4.4`, `1.4.5`, `1.4.10`, `1.4.11`, `1.4.12`, `1.4.13`, `2.1.1`, `2.1.2`, `2.1.4`, `2.2.1`, `2.2.2`, `2.4.1`, `2.4.2`, `2.4.3`, `2.4.4`, `2.4.6`, `2.4.7`, `2.4.11`, `2.5.1`, `2.5.2`, `2.5.3`, `2.5.4`, `2.5.7`, `2.5.8`, `3.1.1`, `3.1.2`, `3.2.1`, `3.2.2`, `3.2.5`, `3.2.6`, `3.3.1`, `3.3.2`, `3.3.3`, `3.3.4`, `3.3.7`, `3.3.8`, `4.1.1`, `4.1.2`, `4.1.3`

Coverage is often a **slice** of the full SC (presence vs pertinence, single-page vs site-wide).

---

## How to prioritize

Work top-down. Within a band, prefer React/Next JSX patterns, then axe promotions, then custom Playwright.

| Band | Ship when | Authority |
| --- | --- | --- |
| **P0** | axe already detects it; we just don't model it | Runtime (map + new `CheckId`) and/or a small AST twin for CI |
| **P1** | Visible in TSX; deterministic; high hit-rate in product UIs | AST (+ axe map if one exists) |
| **P2** | Needs the rendered page (layout, CSS, keyboard, reflow) | Runtime-only; stay `unable_to_verify` without preview URL |
| **P3** | WCAG 2.2-only (not in RGAA 4.1.2) | Same engines; keep on the WCAG preset even if RGAA Full omits them until RGAA 5 |
| **P4** | Cannot be scored by AST or axe | Seed `checkId: null`; never auto-pass |
| **Defer** | WCAG AAA, site-wide IA, office documents, caption *quality* | Human later, or skip |

A new control is not done until: `CheckId` + guidance + catalog row with the **official** RGAA/WCAG codes + exhaustive switch coverage + tests (violation and clean). AST checks also need a `packages/check/testdata` fixture.

---

## Open backlog

### P2 — Runtime (deferred / low priority)

| Proposed `checkId` | RGAA | WCAG | Notes |
| --- | --- | --- | --- |
| `css-disabled-content` | 10.2 | 1.3.1 A | Start with text only in CSS `content:` / `background-image`. |
| `html-lang-valid` | 8.4 | 3.1.1 A | Optional split; `html-lang-valid` axe rule already maps to `html-lang`. |

### Site-level (multi-route runtime or human)

| RGAA | WCAG | Title |
| --- | --- | --- |
| 12.1 | 2.4.5 AA | At least two ways to find pages |
| 12.2 | 3.2.3 AA | Nav in the same place across the set |
| 12.3–12.5 | 2.4.5 | Sitemap/search pertinence and consistent reach |
| 11.3 | 3.2.4 AA | Same-purpose labels consistent across pages |

---

## Remaining RGAA 4.1.2 (A/AA) gaps

Default engine is **human** unless noted. Rows already covered by an automated control are omitted.

### 1. Images

| RGAA | WCAG | Title | Engine |
| --- | --- | --- | --- |
| 1.4 | 1.1.1 | CAPTCHA / test image alternative identifies function | Human |
| 1.5 | 1.1.1 | CAPTCHA has a non-image alternative | Human |
| 1.6 | 1.1.1 | Complex image has a detailed description when needed | Human (+ weak AST: `aria-describedby` / `longdesc`) |
| 1.7 | 1.1.1 | Detailed description is pertinent | Human |
| 1.8 | 1.4.5 | Image of text replaced by styled text when possible | Partial: `image-of-text` (fix RGAA code — see mapping debt) |

### 2. Frames

| RGAA | WCAG | Title | Engine |
| --- | --- | --- | --- |
| 2.2 | 4.1.2 | Frame title is pertinent | P4 `ctl-frame-title-relevant` |

### 3. Colors

| RGAA | WCAG | Slice | Engine |
| --- | --- | --- | --- |
| 3.1 | 1.4.1 | Not color alone | `use-of-color` (runtime) |
| 3.2 | 1.4.3 | Text contrast | `color-contrast` (runtime) |
| 3.3 | 1.4.11 | Non-text contrast | `non-text-contrast` (runtime) |

### 4. Multimedia (quality + control)

| RGAA | WCAG | Title | Engine |
| --- | --- | --- | --- |
| 4.2 | 1.2.1 / 1.2.3 | Transcript / AD is pertinent | Human |
| 4.4 | 1.2.2 | Captions are pertinent | P4 |
| 4.5 | 1.2.5 AA | Synchronized audio-description when needed | Human |
| 4.6 | 1.2.5 | Audio-description is pertinent | Human |
| 4.7–4.9 | 1.1.1 | Media identification and alternatives | Human |
| 4.11 | 2.1.1 | Temporal media controllable by keyboard | Runtime (player chrome) |
| 4.12 | 2.1.1 | Non-temporal media controllable by keyboard | Runtime |
| 4.13 | 4.1.2 | Media compatible with assistive tech | Human / runtime |

Presence slices shipped: `video-caption`, `audio-caption`, `autoplay-media`, `no-blink-marquee`.

### 5. Tables

| RGAA | WCAG | Title | Engine |
| --- | --- | --- | --- |
| 5.1 | 1.3.1 | Complex data table has a summary | AST heuristic candidate |
| 5.2 | 1.3.1 | Summary is pertinent | Human |
| 5.3 | 1.3.2 | Layout table linearized sensibly | Human |
| 5.5 | 1.3.1 | Table title is pertinent | Human |

Shipped: `table-headers`, `table-caption`, `th-scope`, `empty-th`, `layout-table-markup`.

### 6. Links

6.1 (explicit purpose) → P4 `ctl-link-explicit`. 6.2 (has a name) → `anchor-name`.

### 7. Scripts

| RGAA | WCAG | Title | Engine |
| --- | --- | --- | --- |
| 7.2 | 4.1.2 | Script alternative is pertinent | Human |
| 7.3 | 2.1.1 | Script controllable by keyboard | Partial `keyboard-interaction`, `frame-keyboard` |
| 7.4 | 3.2.1 / 3.2.2 | User warned or in control of context changes | Partial `focus-context-change`, `input-context-change` |

Shipped: `status-live` (7.5 / 4.1.3).

### 8. Mandatory elements

| RGAA | WCAG | Title | Engine |
| --- | --- | --- | --- |
| 8.2 | 4.1.1 obsolete | Valid generated source | `duplicate-id` slice only |
| 8.6 | 2.4.2 | Page title is pertinent | P4 |
| 8.9 | 1.3.1 | Markup not for presentation only | Partial `presentation-role`, `p-as-heading`, `redundant-role` |

Shipped: `html-lang`, `doctype`, `dir-change` (8.10).

### 9. Structure

9.1–9.3 → `heading-order`, `empty-heading`, `list-structure`. 9.4 → `blockquote-cite`.

### 10. Presentation

| RGAA | WCAG | Title | Engine |
| --- | --- | --- | --- |
| 10.1 | 1.3.1 | CSS controls presentation | Human / N/A for React |
| 10.3 | 1.3.2 | Understandable with CSS off | Human |
| 10.6 | 1.4.1 | Links distinguishable from text | `use-of-color` |
| 10.7 | 2.4.7 | Visible focus | `focus-visible` (runtime), `outline-none` (AST heuristic) |
| 10.8 | 4.1.2 | Hidden content meant to be ignored | Human |
| 10.9 | 1.3.3 | Not shape/size/position alone | Partial `sensory-characteristics` |
| 10.10 | 1.3.3 | Rule implemented pertinently | Human |
| 10.11 | 1.4.10 | Reflow | `reflow` |
| 10.12 | 1.4.12 | Text spacing (rendered) | `text-spacing` (AST) + `text-spacing-runtime` |
| 10.13–10.14 | 1.4.13 | Hover/focus content | `hover-content` (heuristic) |

### 11. Forms

| RGAA | WCAG | Title | Engine |
| --- | --- | --- | --- |
| 11.2 | 3.3.2 | Label is pertinent | P4 |
| 11.3 | 3.2.4 | Consistent labels across pages | Site crawl |
| 11.7 | 1.3.1 | Group legend is pertinent | Human |
| 11.9 | 4.1.2 | Button name is pertinent | Human (`button-name` = presence) |
| 11.10 | 3.3.1 | Validation used pertinently | Partial `form-error-association` |
| 11.12 | 3.3.4 AA | Legal/financial reversible | P4 |

Shipped: `form-error-association`, `fieldset-legend`, `label-adjacent`, `redundant-entry`. 11.4 → `label-adjacent`.

### 12. Navigation

| RGAA | WCAG | Title | Engine |
| --- | --- | --- | --- |
| 12.1, 12.2, 12.3–12.5 | 2.4.5, 3.2.3 | Multiple ways, consistent nav/search | Site-level |
| 12.8 | 2.4.3 | Focus order matches visual order | P4 (+ `positive-tabindex` slice) |
| 12.9 | 2.1.2 | No keyboard trap | `keyboard-trap` |

### 13. Consultation

| RGAA | WCAG | Title | Engine |
| --- | --- | --- | --- |
| 13.1 | 2.2.1 | User controls time limits | Partial `no-auto-refresh` |
| 13.2 | 3.2.5 | No unsolicited new windows | `new-window-onload` |
| 13.3–13.6 | 1.1.1 | Office docs, ASCII art alternatives | Human |
| 13.7 | 2.3.1 | Flashes below threshold | Human / specialized tooling |

Shipped pointer/motion: `pointer-gesture`, `pointer-cancellation`, `motion-actuation`, `dragging`, `no-accesskey`.

---

## Missing WCAG 2.2 A/AA (not in catalog)

| WCAG | Level | Closest RGAA | Planned band |
| --- | --- | --- | --- |
| 1.2.3 | A | 4.1 | Human |
| 1.2.4 | AA | — | Human (live captions) |
| 1.2.5 | AA | 4.5 | Human |
| 2.3.1 | A | 13.7 | Human |
| 2.4.5 | AA | 12.1 | Site-level |
| 3.2.3 | AA | 12.2 | Site-level |
| 3.2.4 | AA | 11.3 | Site-level |

WCAG AAA stays out of the MVP catalog.

---

## Suggested implementation order

1. ~~P0 axe promotions~~ — shipped.
2. ~~P1 AST checks~~ — shipped.
3. ~~P4 human pertinence seed (9 controls)~~ — shipped.
4. ~~P2 `focus-visible` + `keyboard-trap`~~ — shipped.
5. ~~P3 WCAG 2.2 (`focus-not-obscured`, `accessible-auth`, `dragging`)~~ — shipped.
6. ~~P2 remainder + P3 `redundant-entry` + P4 `consistent-help`~~ — shipped.
7. **Site-level** (12.1–12.5, 11.3) then deferred P2 (`css-disabled-content`, `html-lang-valid` split).

---

## How to add a rule

Follow `.cursor/rules/analysis-engine.mdc`. Touch only what the engine needs:

1. `src/analysis/types.ts` — add the `CheckId`.
2. AST: `src/analysis/checks/<id>.ts` + `*.test.ts`, register in `registry.ts`. Runtime-only: skip AST, add to `RUNTIME_ONLY_CHECK_IDS` in `check-authority.ts`. Custom Playwright: add a module under `custom-checks/` + synthetic id in `axe-map.ts`.
3. `src/analysis/runtime/axe-map.ts` — map every axe rule that should status this control.
4. `src/adapters/rgaa/controls.ts` — one control, **official** `code` / `secondaryCode`, `complianceWeight`. Add to presets (`presets.ts`, `wcag/presets.ts`).
5. `src/adapters/rgaa/guidance.ts` — impact + how to fix.
6. AST: deliberate violation in `packages/check/testdata/Coverage.tsx`.
7. Human-only: `checkId: null`; status stays `unable_to_verify` until human pass or exception.
8. Update this file: move row from open backlog to [Implemented coverage](#implemented-coverage).

AI never sets the requirement status.

---

## Mapping debt

Fix these when touching the neighboring control. New rows use official numbers; the catalog currently does not.

| Catalog `checkId` | Stored as | Official criterion | Issue |
| --- | --- | --- | --- |
| `autoplay-media` | RGAA 4.1 | **4.10** (WCAG 1.4.2) | 4.1 is transcript/AD, not autoplay. |
| `aria-role` | 8.6 | **7.1** | 8.6 is page-title pertinence. |
| `aria-props` | 8.7 | **7.1** | 8.7 is language-of-parts presence. |
| `aria-required-attr` | 8.8 | **7.1** | Collides with `lang-parts`. |
| `no-autofocus` | 12.7 | **12.8** (or 2.4.3 only) | 12.7 is skip link (`bypass`). |
| `target-size` | 11.11 | WCAG **2.5.8** | 11.11 is error suggestions. |
| `pointer-gesture` | 11.6 | **13.10** | 11.6 is fieldset legend (`fieldset-legend`). |
| `pointer-cancellation` | 11.7 | **13.11** | 11.7 is legend pertinence. |
| `focus-context-change` | 10.9 | **7.4** (WCAG 3.2.1) | 10.9 is sensory characteristics. |
| `input-context-change` | 10.10 | **7.4** (WCAG 3.2.2) | 10.10 is pertinence of 10.9. |
| `sensory-characteristics` | 10.3 | **10.9** | 10.3 is “understandable with CSS off”. |
| `image-of-text` | 10.1 | **1.8** | 10.1 is “use CSS for presentation”. |
| `error-suggestion` | 11.12 | **11.11** | 11.12 is legal/financial error prevention (P4). |
| `no-auto-refresh` | 13.2 | **13.1** | 13.2 is unsolicited windows (`new-window-onload`). |
| `content-region` | 9.2.1 | **9.2 / 12.6** | 9.2.1 is not an RGAA number. |
| `label-in-name` | 11.1 | WCAG **2.5.3** | 11.1 is `input-label` presence. |
| `new-window-onload` | 13.2 | **13.2** ✓ | Correct. `no-auto-refresh` still mis-mapped. |
| `link-name` control | RGAA 6.1 | **6.2** for presence | 6.1 is explicit purpose (P4). |

AAA presets still include Level A SCs that belong in AA/Full. Re-bin when touching presets.

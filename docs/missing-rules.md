# Coverage gaps: RGAA 4.1.2 and WCAG 2.2

Prioritized work to close the gap between the official methods and what ComplyLoop can actually verify. Architecture overview: [`docs/ai/architecture.md`](./ai/architecture.md). Implementation plan: [`docs/superpowers/plans/2026-09-01-rgaa-wcag-coverage.md`](./superpowers/plans/2026-09-01-rgaa-wcag-coverage.md).

**Analyzed:** 2026-09-01 against [RGAA 4.1.2 critères et tests](https://accessibilite.numerique.gouv.fr/methode/criteres-et-tests/) (106 criteria, 258 tests) and [WCAG 2.2 How to Meet](https://www.w3.org/WAI/WCAG22/quickref/) (86 success criteria after 4.1.1 is obsolete). DINUM source count confirmed via [criteres.json](https://github.com/DISIC/accessibilite.numerique.gouv.fr).

## Snapshot

| Surface | Count | Notes |
| --- | ---: | --- |
| RGAA 4.1.2 criteria | 106 | Legal method for French public sector; WCAG 2.1 A/AA transposed |
| Criteria with ≥1 catalog control | 91 | 15 criteria have no control at all |
| Catalog controls | 125 | Shared RGAA/WCAG catalog in `src/adapters/rgaa/controls.ts` |
| Controls with a machine check | 95 | AST, runtime, or site-level |
| Human-only controls (`checkId: null`) | 30 | Stay `unable_to_verify` until a human pass or exception |
| AST checks | 62 | CI / `complyloop-check` |
| Runtime-only checks | 33 | Need `runtimeBaseUrl` |
| Site-level checks | 3 | Need ≥2 preview routes |
| Unique WCAG SCs referenced | 55 | WCAG 2.2 has 86 SCs (50 A/AA + 36 AAA) |
| axe-core 4.13 rules | 105 | 88 mapped, 17 ignored (mostly best-practice) |

RGAA 4.1.2 does **not** include WCAG 2.2 additions. Those live in the catalog as WCAG-only codes (`2.4.11`, `2.5.7`, `2.5.8`, `3.2.6`, `3.3.7`, `3.3.8`). RGAA 5 (expected end of 2026) will likely absorb them.

## How to read coverage

Each official criterion is one of:

| Tag | Meaning |
| --- | --- |
| **AST / RT / SITE** | A check exists and covers the automatable tests reasonably |
| **PART** | A check exists but misses official tests or element types |
| **HEUR** | Low-confidence warning; must not be treated as a pass of the criterion |
| **MAN** | Catalog control exists; only a human can close it |
| **MISS** | No control in the catalog — Full RGAA silently skips it |
| **MAP** | Control exists but is wired to the wrong criterion or over-claims |

A requirement is never `passed` from an empty scan for runtime-only or manual controls. Heuristic AST checks that emit nothing still allow `passed` today — that is a product risk called out under P0.

## Current engine inventory

**AST (62):** img-alt, button-name, anchor-name, html-lang, positive-tabindex, input-label, heading-order, empty-heading, iframe-title, autoplay-media, duplicate-id, form-error-association, aria-hidden-focusable, aria-role, aria-props, aria-required-attr, no-autofocus, keyboard-interaction, meta-viewport, list-structure, autocomplete-valid, pointer-gesture, pointer-cancellation, motion-actuation, focus-context-change, input-context-change, sensory-characteristics, image-of-text, error-suggestion, video-caption, audio-caption, no-blink-marquee, text-spacing, empty-th, dialog-name, tab-name, summary-name, p-as-heading, fieldset-legend, autocomplete-purpose, no-accesskey, optgroup, table-caption, table-summary, th-scope, layout-table-markup, svg-name, figure-caption, image-detailed-description, redundant-role, noninteractive-tabindex, aria-activedescendant, accessible-auth, dragging, new-window-onload, dir-change, blockquote-cite, outline-none, status-live, both-colors, redundant-entry, media-controls-present.

**Runtime-only (33):** color-contrast, document-title, bypass, landmark-one-main, nested-interactive, target-size, table-headers, page-heading, content-region, label-in-name, lang-parts, html-lang-valid, aria-roledescription, presentation-role, no-auto-refresh, no-orientation-lock, landmark-unique, use-of-color, frame-keyboard, doctype, focus-visible, keyboard-trap, focus-not-obscured, non-text-contrast, reflow, text-spacing-runtime, hover-content, label-adjacent, both-colors (runtime twin), css-disabled-content, media-keyboard, multiple-ways, consistent-nav, consistent-labels.

**Site-level (3):** multiple-ways, consistent-nav, consistent-labels.

## RGAA 4.1.2 — criterion map

### 1. Images

| Crit. | Official question (short) | Status | What we have | Gap |
| --- | --- | --- | --- | --- |
| 1.1 | Informative image has a text alternative | **PART** | `img-alt` (`<img>` / Next `Image`), `svg-name`; axe maps `image-alt`, `area-alt`, `input-image-alt`, `object-alt`, `role-img-alt`, `svg-img-alt` at runtime | AST misses `<area>`, `input type="image"`, `<object>`, `<embed>`, `<canvas>`, `role="img"`. SVG check does not require `role="img"` (test 1.1.5). No AST for `ismap` (1.1.4); axe `server-side-image-map` is unmapped |
| 1.2 | Decorative image ignored by AT | **MAN** | `ctl-decorative-ignored` | Presence of `alt=""` / `role="presentation"` is machine-checkable; whether the image is decorative is human |
| 1.3 | Alternative is pertinent | **MAN** | `ctl-img-alt-relevant` | Keep human. Generic-alt warning on `img-alt` is a useful HEUR, not a 1.3 pass |
| 1.4 | CAPTCHA alt identifies function | **MAN** | `ctl-captcha-alt` | Stay human |
| 1.5 | CAPTCHA has a non-image alternative | **MISS** | — | Add a human control. Optional HEUR: CAPTCHA-like `alt` without an adjacent alternative link |
| 1.6 | Complex image has a detailed description | **HEUR** | `image-detailed-description` (src/alt heuristics) | Low confidence; misses SVG/canvas/object. Do not auto-pass 1.6 |
| 1.7 | Detailed description is pertinent | **MAN** | `ctl-image-description-relevant` | Stay human |
| 1.8 | Images of text replaced by styled text | **HEUR** | `image-of-text` | Background-image / `role="img"` with text only. Real 1.8 needs a human |
| 1.9 | Image legend associated (`<figure>`/`<figcaption>`) | **AST** | `figure-caption` | Reasonable for JSX. Confirm `aria-labelledby` pairing if we see false misses |

### 2. Frames

| Crit. | Official question | Status | What we have | Gap |
| --- | --- | --- | --- | --- |
| 2.1 | Frame has a title | **AST+RT** | `iframe-title` + axe `frame-title` / `frame-title-unique` | Solid |
| 2.2 | Frame title is pertinent | **MAN** | `ctl-frame-title-relevant` | Stay human. Optional HEUR: generic titles (`frame`, `iframe`, empty) |

### 3. Colors

| Crit. | Official question | Status | What we have | Gap |
| --- | --- | --- | --- | --- |
| 3.1 | Information is not color-only | **PART** | `use-of-color` ← axe `link-in-text-block` | That axe rule is closer to **10.6** (links vs surrounding text). 3.1 also covers charts, required fields, status, etc. |
| 3.2 | Text contrast ≥ 4.5:1 (3:1 large) | **RT** | `color-contrast` (axe) | `color-contrast-enhanced` (7:1, AAA 1.4.6) is folded into the same AA check — split or ignore |
| 3.3 | Non-text contrast (UI / graphics) | **RT** | `non-text-contrast` custom | Keep; do not claim completeness for complex graphics |

### 4. Multimedia

| Crit. | Official question | Status | What we have | Gap |
| --- | --- | --- | --- | --- |
| 4.1 | Prerecorded temporal media has transcript or AD | **PART** | `audio-caption` requires a `<track>` on `<audio>` | RGAA also accepts an adjacent transcript. `<video>` audio-only and custom players missed. Live media is N/A |
| 4.2 | Transcript / AD is pertinent | **MAN** | `ctl-transcript-relevant` | Stay human |
| 4.3 | Prerecorded synchronized media has captions | **PART** | `video-caption` (`<track kind=captions\|subtitles>`) | Misses YouTube/Vimeo iframes, custom players, third-party widgets |
| 4.4 | Captions are pertinent | **MAN** | `ctl-captions-relevant` | Stay human |
| 4.5 | Synchronized audio description when needed | **MAN** | `ctl-audio-description` | Add an AST HEUR: `<video>` with spoken content and no `kind="descriptions"` track — warning only |
| 4.6 | Audio description is pertinent | **MISS** | — | Add human control |
| 4.7 | Media is clearly identifiable | **MAN** | `ctl-media-identification` | Stay human (name/context of the player) |
| 4.8 | Non-temporal media has an alternative | **MISS** | — | AST: `<object>` / `<embed>` / `<canvas>` / plugin without name or adjacent alternative (overlaps 1.1.6–1.1.8) |
| 4.9 | That alternative is pertinent | **MISS** | — | Add human control |
| 4.10 | Autoplay sound is controllable | **AST+RT** | `autoplay-media` + axe `no-autoplay-audio` | Solid for `autoPlay`. JS-triggered audio needs runtime |
| 4.11 | Temporal media operable by keyboard | **AST+RT** | `media-controls-present`, `media-keyboard` | Good presence check; custom players remain HEUR |
| 4.12 | Non-temporal media operable by keyboard | **MAN** | `ctl-media-keyboard-static` | Promote: object/embed/canvas without keyboard path |
| 4.13 | Media compatible with AT | **MISS** | — | Human control; optional runtime: media node missing accessible name / `role` |

### 5. Tables

| Crit. | Official question | Status | What we have | Gap |
| --- | --- | --- | --- | --- |
| 5.1 | Complex data table has a summary | **HEUR** | `table-summary` | “Complex” is a judgment; keep warning, not hard fail |
| 5.2 | Summary is pertinent | **MAN** | `ctl-table-summary-relevant` | Stay human |
| 5.3 | Layout table linearizes | **MAN** | `ctl-layout-table-linearization` | Runtime CSS-off reading order is the real test; 10.2/10.3 related |
| 5.4 | Title associated (`<caption>`) | **AST+RT** | `table-caption` + axe `table-fake-caption` | Solid |
| 5.5 | Title is pertinent | **MAN** | `ctl-table-title-relevant` | Stay human |
| 5.6 | Row/column headers correctly declared | **PART** | `empty-th` | Empty `<th>` only. Does not require `<th>` vs styled `<td>` |
| 5.7 | Cells associated with headers | **AST+RT** | `th-scope`, `table-headers` | Strong when runtime runs |
| 5.8 | Layout tables do not use data markup | **AST** | `layout-table-markup` | Solid |

### 6. Links

| Crit. | Official question | Status | What we have | Gap |
| --- | --- | --- | --- | --- |
| 6.1 | Link is explicit (purpose) | **MAN** | `ctl-link-explicit` | Optional HEUR: “click here” / “read more” / “ici” with no extra context |
| 6.2 | Link has an accessible name | **AST+RT** | `anchor-name` | Solid |

### 7. Scripts

| Crit. | Official question | Status | What we have | Gap |
| --- | --- | --- | --- | --- |
| 7.1 | Script compatible with AT (name/role/value) | **AST+RT** | aria-role/props/required-attr, dialog/tab/summary-name, activedescendant, roledescription | Broad but not every ARIA widget. Unmapped axe: `aria-allowed-role`, `aria-treeitem-name`, `aria-text` |
| 7.2 | Script alternative is pertinent | **MAN** | `ctl-script-alternative-relevant` | Stay human |
| 7.3 | Script operable by keyboard | **PART** | `frame-keyboard` (mapped here), `keyboard-interaction` is on **12.11** | **MAP:** 7.3 is the keyboard-script criterion. Move `keyboard-interaction` primary code to 7.3. 12.11 is extra content on hover/focus/activation |
| 7.4 | Context change initiated by script is controlled | **HEUR** | `focus-context-change`, `input-context-change` | AST of handlers is incomplete vs real navigation |
| 7.5 | Status messages exposed to AT | **AST** | `status-live` | Presence of live region / `role="status"` heuristics; dynamic toasts need runtime |

### 8. Mandatory elements

| Crit. | Official question | Status | What we have | Gap |
| --- | --- | --- | --- | --- |
| 8.1 | Doctype present | **RT** | `doctype` | Solid |
| 8.2 | Generated source valid for the doctype | **MAP** | `duplicate-id` coded as 8.2 | Unique IDs are a slice of validity / obsolete WCAG 4.1.1. Real 8.2 is HTML validity. Keep duplicate-id; retarget code to 8.2 only as “IDs unique”, add a separate validity note or drop over-claim |
| 8.3 | Default language present | **AST+RT** | `html-lang` | Solid |
| 8.4 | Language code pertinent / valid | **RT** | `html-lang-valid` | Valid BCP 47 ≠ pertinent (page is actually French). Validity automated; pertinence human |
| 8.5 | Page has a title | **RT** | `document-title` | Solid |
| 8.6 | Page title pertinent | **MAN** | `ctl-page-title-relevant` | Stay human. Site-level HEUR: identical titles on every route |
| 8.7 | Language changes indicated | **MISS** | `lang-parts` is coded **8.8** | Split: 8.7 = `lang` present on foreign passages (hard); 8.8 = those codes valid. axe `valid-lang` is 8.8/3.1.2, not 8.7 |
| 8.8 | Language-change codes valid and pertinent | **PART** | `lang-parts` | Validity via axe; pertinence human |
| 8.9 | Tags not used only for presentation | **PART** | nested-interactive, presentation-role, aria-hidden-focusable, redundant-role, p-as-heading | Incomplete vs spacer GIFs, `<table>` layout (5.8), `<div>` as heading, etc. |
| 8.10 | Reading-direction changes marked (`dir`) | **AST** | `dir-change` | Reasonable |

### 9. Structure

| Crit. | Official question | Status | What we have | Gap |
| --- | --- | --- | --- | --- |
| 9.1 | Information structured with headings | **AST+RT** | `heading-order`, `p-as-heading` | `empty-heading` is coded 9.2 — **MAP** to 9.1 |
| 9.2 | Document structure coherent (landmarks) | **PART** | `page-heading`, `content-region` | 9.2 is header/nav/main/footer consistency, not “has an h1”. `page-heading` is closer to WCAG 2.4.6 |
| 9.3 | Lists correctly structured | **AST+RT** | `list-structure` | Solid |
| 9.4 | Quotations correctly marked | **PART** | `blockquote-cite` | Only fires when `cite` exists without visible citation. Bare quoted text without `<blockquote>`/`<q>` is the real 9.4 miss |

### 10. Presentation

| Crit. | Official question | Status | What we have | Gap |
| --- | --- | --- | --- | --- |
| 10.1 | CSS used to control presentation | **MISS** | — | Human / HEUR: layout tables, `<font>`, `align`, spacer images |
| 10.2 | Informative content still present with CSS off | **RT** | `css-disabled-content` | First-hit only; misses background-image text that also has a tiny pseudo |
| 10.3 | Content still understandable with CSS off | **MISS** | — | Reading-order / linearization. Related to 5.3. Needs CSS-disabled DOM snapshot, then human |
| 10.4 | Text readable at 200% zoom | **PART** | `meta-viewport` | Viewport lock ≠ 200% zoom / 1.4.4. Need a runtime resize check (related to `reflow` 10.11 / 1.4.10) |
| 10.5 | CSS color and background used together | **AST+RT** | `both-colors` | Solid |
| 10.6 | Links obvious vs surrounding text | **MAP** | folded into `use-of-color` (3.1) | Give 10.6 its own control; keep axe `link-in-text-block` as the engine |
| 10.7 | Focus visible | **AST+RT** | `outline-none`, `focus-visible` | Strong |
| 10.8 | Hidden content intended to be ignored by AT | **MAN** | `ctl-hidden-content-ignored` | Overlaps `aria-hidden-focusable`. Promote a runtime check for visually hidden but still in the a11y tree (or vice versa) |
| 10.9 | Info not by shape/size/position alone | **HEUR** | `sensory-characteristics` | Copy heuristics. Stay warning |
| 10.10 | That rule implemented pertinently | **MAN** | `ctl-sensory-rule-relevant` | Stay human |
| 10.11 | Reflow 320×256 | **RT** | `reflow` | Solid |
| 10.12 | Text spacing override | **AST+RT** | `text-spacing`, `text-spacing-runtime` | Solid |
| 10.13 | Hover/focus extra content controllable | **RT** | `hover-content` | Solid start |
| 10.14 | CSS-only extra content available to keyboard | **MISS** | — | Runtime: `:hover` / `:focus` content not reachable via keyboard (distinct from 10.13 dismiss/hoverable) |

### 11. Forms

| Crit. | Official question | Status | What we have | Gap |
| --- | --- | --- | --- | --- |
| 11.1 | Field has a label | **AST+RT** | `input-label` | `label-in-name` (WCAG 2.5.3) is coded 11.1 — **MAP** to its own WCAG code |
| 11.2 | Label is pertinent | **MAN** | `ctl-label-relevant` | Stay human |
| 11.3 | Same-purpose labels consistent | **SITE** | `consistent-labels` | Needs ≥2 routes |
| 11.4 | Label adjacent to field | **RT** | `label-adjacent` | Solid |
| 11.5 | Same-nature fields grouped when needed | **MISS** | `fieldset-legend` is **11.6** | 11.5 = grouping exists; 11.6 = legend present. Split: checkboxes/related fields without fieldset |
| 11.6 | Grouping has a legend | **AST** | `fieldset-legend` | Good for radios; expand to checkbox clusters |
| 11.7 | Legend pertinent | **MAN** | `ctl-legend-relevant` | Stay human |
| 11.8 | Select options grouped | **AST** | `optgroup` | Solid |
| 11.9 | Button name pertinent | **AST + MAN** | `button-name` (presence) + `ctl-button-name-relevant` | Presence is 4.1.2/11.9 test 1; pertinence stays human |
| 11.10 | Input validation used pertinently | **PART + MAN** | `form-error-association` + `ctl-validation-relevant` | Association automated; “pertinent” human |
| 11.11 | Error suggests a correction | **HEUR** | `error-suggestion` | Copy heuristics |
| 11.12 | Legal/financial/data reversible | **MAN** | `ctl-error-prevention` | Stay human (WCAG 3.3.4) |
| 11.13 | Input purpose identifiable (`autocomplete`) | **AST** | `autocomplete-valid`, `autocomplete-purpose` | Solid for common fields |

### 12. Navigation

| Crit. | Official question | Status | What we have | Gap |
| --- | --- | --- | --- | --- |
| 12.1 | ≥2 navigation systems | **SITE** | `multiple-ways` | Solid given ≥2 routes |
| 12.2 | Nav in the same place | **SITE** | `consistent-nav` | Order/href signature; not visual position |
| 12.3 | Sitemap page pertinent | **MAN** | `ctl-sitemap-relevant` | Stay human |
| 12.4 | Sitemap reachable via identical control | **MAP** | `ctl-search-relevant` titled “Search results are pertinent” | **Wrong criterion.** 12.4 is sitemap entry-point consistency. Site-level: sitemap link present in the same place |
| 12.5 | Search reachable via identical control | **MAP** | `ctl-nav-mechanisms-relevant` titled “Navigation mechanisms are pertinent” | **Wrong criterion.** 12.5 is search entry-point consistency |
| 12.6 | Landmark regions can be reached or skipped | **PART** | `landmark-one-main`, `landmark-unique` | 12.6 is also header/nav/footer/search as landmarks. Unmapped axe: `landmark-banner-is-top-level`, `landmark-contentinfo-is-top-level`, `landmark-no-duplicate-banner`, `landmark-no-duplicate-contentinfo` |
| 12.7 | Skip link to main | **MAP** | `bypass` (correct-ish) **and** `no-autofocus` (wrong) | Autofocus is not 12.7. Retarget `no-autofocus` (3.2.1 / 13.2-adjacent). Skip-link uniqueness vs axe `bypass`/`skip-link` |
| 12.8 | Tab order coherent | **PART** | `positive-tabindex`, `noninteractive-tabindex` + MAN `ctl-focus-order-logical` | Positive tabindex ≠ visual vs DOM order. Runtime `focus-order-semantics` is unmapped best-practice |
| 12.9 | No keyboard trap | **RT** | `keyboard-trap` | Solid |
| 12.10 | Single-key shortcuts user-controllable | **PART** | `no-accesskey` (+ unmapped axe `accesskeys`) | RGAA/WCAG 2.1.4 allow shortcuts if remappable or only on focus. Banning `accessKey` is a strict subset. Map axe `accesskeys` |
| 12.11 | Extra content on hover/focus/activation reachable by keyboard | **MAP** | `keyboard-interaction` | Overlaps 10.13/10.14/7.3. Keep the check; recode to 7.3 and let 12.11 share `hover-content` |

### 13. Consultation

| Crit. | Official question | Status | What we have | Gap |
| --- | --- | --- | --- | --- |
| 13.1 | User controls each time limit | **PART** | `no-auto-refresh` (meta refresh) | Misses JS timers, session timeout, carousels. WCAG 2.2.1 is broader |
| 13.2 | New window not without user action | **AST** | `new-window-onload` | Misses `target="_blank"` without warning (RGAA also cares about indication — often 13.2 tests + glossary) |
| 13.3 | Office download has an accessible version | **MAN** | `ctl-office-docs-alt` | HEUR: `.pdf/.docx` links without an HTML alternative href |
| 13.4 | That accessible version is equivalent | **MISS** | — | Human control |
| 13.5 | Cryptic content (ASCII art, emoji clusters) has an alternative | **MISS** | — | Human + optional HEUR for `aria-label` on emoji-only nodes |
| 13.6 | That alternative is pertinent | **MISS** | — | Human control |
| 13.7 | Flashes below threshold | **MAN** | `ctl-flash-threshold` | Stay human (WCAG 2.3.1). Do not fake a seizure check |
| 13.8 | Moving / blinking content controllable | **PART** | `no-blink-marquee` | Misses CSS `animation`, carousels, `prefers-reduced-motion` |
| 13.9 | Content usable in any orientation | **MAP** | `no-orientation-lock` coded **RGAA 13.9.1** (invalid) | Fix code to `RGAA 13.9`. axe `css-orientation-lock` already mapped |
| 13.10 | Complex pointer gesture has a simple alternative | **HEUR** | `pointer-gesture` | AST of handlers |
| 13.11 | Single-pointer action cancellable | **HEUR** | `pointer-cancellation` | AST of handlers |
| 13.12 | Motion actuation has an alternative | **HEUR** | `motion-actuation` | AST of handlers |

## WCAG 2.2 — success criteria map

Catalog is still labeled **WCAG 2.1** (`fw-wcag-2-1`, presets “WCAG 2.1 AA”). Several 2.2 SCs are already implemented. AAA presets are **not** WCAG AAA — they are AA plus a handful of extra heuristics (`pointer-gesture`, `error-suggestion`, …).

### Level A (must for AA products)

| SC | Name | Coverage |
| --- | --- | --- |
| 1.1.1 | Non-text Content | PART (see RGAA 1.x) |
| 1.2.1 | Audio-only and Video-only (Prerecorded) | PART (`audio-caption`) |
| 1.2.2 | Captions (Prerecorded) | PART (`video-caption`) |
| 1.2.3 | Audio Description or Media Alternative (Prerecorded) | MAN/MISS — no dedicated control (4.1/4.5 overlap) |
| 1.3.1 | Info and Relationships | PART (headings, lists, tables, labels, landmarks) |
| 1.3.2 | Meaningful Sequence | PART (`dir-change`, layout-table MAN) — 10.3 missing |
| 1.3.3 | Sensory Characteristics | HEUR |
| 1.4.1 | Use of Color | PART |
| 1.4.2 | Audio Control | AST+RT (`autoplay-media`) |
| 2.1.1 | Keyboard | PART |
| 2.1.2 | No Keyboard Trap | RT |
| 2.1.4 | Character Key Shortcuts | PART (`no-accesskey` only) |
| 2.2.1 | Timing Adjustable | PART (meta-refresh) |
| 2.2.2 | Pause, Stop, Hide | PART (blink/marquee) |
| 2.3.1 | Three Flashes or Below Threshold | MAN |
| 2.4.1 | Bypass Blocks | RT |
| 2.4.2 | Page Titled | RT + MAN pertinence |
| 2.4.3 | Focus Order | PART |
| 2.4.4 | Link Purpose (In Context) | AST name + MAN purpose |
| 2.5.1 | Pointer Gestures | HEUR |
| 2.5.2 | Pointer Cancellation | HEUR |
| 2.5.3 | Label in Name | RT — **MAP** currently on RGAA 11.1 |
| 2.5.4 | Motion Actuation | HEUR |
| 3.1.1 | Language of Page | AST+RT |
| 3.2.1 | On Focus | HEUR |
| 3.2.2 | On Input | HEUR |
| 3.3.1 | Error Identification | PART |
| 3.3.2 | Labels or Instructions | AST+RT |
| 3.3.7 | Redundant Entry (2.2) | AST `redundant-entry` |
| 4.1.1 | Parsing | Obsolete in 2.2; still mapped via `duplicate-id` / RGAA 8.2 |
| 4.1.2 | Name, Role, Value | Broad AST+RT |

### Level AA

| SC | Name | Coverage |
| --- | --- | --- |
| 1.2.4 | Captions (Live) | **MISS** |
| 1.2.5 | Audio Description (Prerecorded) | MAN `ctl-audio-description` |
| 1.3.4 | Orientation | RT |
| 1.3.5 | Identify Input Purpose | AST |
| 1.4.3 | Contrast (Minimum) | RT |
| 1.4.4 | Resize Text | PART (`meta-viewport` only) |
| 1.4.5 | Images of Text | HEUR |
| 1.4.10 | Reflow | RT |
| 1.4.11 | Non-text Contrast | RT |
| 1.4.12 | Text Spacing | AST+RT |
| 1.4.13 | Content on Hover or Focus | RT |
| 2.4.5 | Multiple Ways | SITE |
| 2.4.6 | Headings and Labels | PART (`page-heading` = has h1, not “descriptive”) |
| 2.4.7 | Focus Visible | AST+RT |
| 2.4.11 | Focus Not Obscured (Minimum) (2.2) | RT |
| 2.5.7 | Dragging Movements (2.2) | AST `dragging` |
| 2.5.8 | Target Size (Minimum) (2.2) | RT |
| 3.1.2 | Language of Parts | PART (`lang-parts`) |
| 3.2.3 | Consistent Navigation | SITE |
| 3.2.4 | Consistent Identification | SITE |
| 3.2.6 | Consistent Help (2.2) | **MAN** `ctl-consistent-help` — should be SITE like 3.2.3 |
| 3.3.3 | Error Suggestion | HEUR |
| 3.3.4 | Error Prevention (Legal, Financial, Data) | MAN |
| 3.3.8 | Accessible Authentication (Minimum) (2.2) | AST |
| 4.1.3 | Status Messages | AST |

### Level AAA — do not pretend we cover these

No dedicated automated coverage (and the AAA preset must not imply otherwise): 1.2.6, 1.2.7, 1.2.8, 1.2.9, 1.3.6, 1.4.6, 1.4.7, 1.4.8, 1.4.9, 2.1.3, 2.2.3, 2.2.4, 2.2.5, 2.2.6, 2.3.2, 2.3.3, 2.4.8, 2.4.9 (axe `identical-links-same-purpose` unmapped), 2.4.10, 2.4.12, 2.4.13, 2.5.5, 2.5.6, 3.1.3, 3.1.4, 3.1.5, 3.1.6, 3.2.5, 3.3.5, 3.3.6, 3.3.9.

`color-contrast-enhanced` currently reports as AA `color-contrast` — stop folding AAA 1.4.6 into AA 1.4.3.

## Catalog hygiene (do this before new checks)

These are correctness bugs, not missing rules. They make Full RGAA lie about which obligation was assessed.

1. **Invalid code `RGAA 13.9.1`** → `RGAA 13.9`.
2. **15 criteria absent from the catalog** (Full preset cannot be “every RGAA criterion”): 1.5, 4.6, 4.8, 4.9, 4.13, 8.7, 10.1, 10.3, 10.6, 10.14, 11.5, 13.4, 13.5, 13.6.
3. **12.4 / 12.5 titles describe the wrong tests** (`ctl-search-relevant`, `ctl-nav-mechanisms-relevant`).
4. **`no-autofocus` on 12.7** (skip link). Recode.
5. **`lang-parts` on 8.8** instead of 8.7; 8.8 needs a validity sibling.
6. **`empty-heading` on 9.2** — belongs with 9.1.
7. **`label-in-name` on 11.1** — WCAG 2.5.3.
8. **`keyboard-interaction` on 12.11** — primary 7.3.
9. **`duplicate-id` claiming 8.2 validity / WCAG 4.1.1** — 4.1.1 is obsolete in 2.2; keep the check, stop calling it “source is valid”.
10. **AA/AAA presets duplicate control ids** (`ctl-html-lang-valid`, `ctl-table-summary`, `ctl-image-detailed-description`, `ctl-media-controls-present`).
11. **WCAG adapter still named 2.1** while 2.2 AA SCs are in the catalog.
12. **AAA presets ≠ WCAG AAA.** Either add real AAA SCs as human controls or rename to “AA + extra heuristics”.

## Unmapped axe-core rules worth a decision

| axe id | WCAG / notes | Action |
| --- | --- | --- |
| `server-side-image-map` | 1.1.1 / RGAA 1.1.4 | Map to new or existing `img-alt` / dedicated check |
| `accesskeys` | 2.1.4 / RGAA 12.10 | Map to `no-accesskey` |
| `landmark-banner-is-top-level` | 1.3.1 / 12.6 | Map to `landmark-one-main` or `content-region` |
| `landmark-contentinfo-is-top-level` | same | same |
| `landmark-no-duplicate-banner` | same | same |
| `landmark-no-duplicate-contentinfo` | same | same |
| `identical-links-same-purpose` | 2.4.9 AAA | Only if we add an AAA control |
| `hidden-content` | best-practice | Consider for 10.8 runtime |
| `label-title-only` | best-practice | Useful 11.1 HEUR (title is not a label) |
| `aria-allowed-role` | best-practice | Optional 7.1 |
| `aria-treeitem-name` | best-practice | Optional 7.1 |
| `frame-tested`, `focus-order-semantics`, `image-redundant-alt`, `table-duplicate-name`, `aria-text` | best-practice | Ignore unless a criterion needs them |

## Prioritized to-do

Priority is **legal + automatable + currently silent or lying**, not “everything DINUM lists”. Pertinence, flashing, reading level, and office-document equivalence stay human.

### P0 — Stop lying, then close silent A/AA holes

Catalog and mapping first so new checks land on the right control.

- [ ] **P0.1** Add the 15 missing RGAA controls (human unless a check is listed below). Fix `RGAA 13.9.1`. Deduplicate presets.
- [ ] **P0.2** Recode mismapped controls (8.7/8.8, 9.1/9.2, 10.6 vs 3.1, 11.1 vs 2.5.3, 11.5 vs 11.6, 12.4, 12.5, 12.7 vs autofocus, 12.11 vs 7.3, 8.2 wording).
- [ ] **P0.3** Rename WCAG framework/presets to **2.2**. AAA preset: either real AAA human controls or a name that does not say “WCAG AAA”.
- [ ] **P0.4** Coverage regression test: every RGAA 4.1.2 id `1.1`–`13.12` has ≥1 control; no duplicate ids in a preset.
- [ ] **P0.5** Expand `img-alt` AST to `area`, `input type="image"`, `role="img"`, `object[type^=image]`, `embed`, `canvas`. Map `server-side-image-map`. Require `role="img"` on informative SVG (1.1.5) in `svg-name`.
- [ ] **P0.6** Non-temporal media alternative (4.8) AST for `object` / `embed` / `canvas` without a name or adjacent alternative.
- [ ] **P0.7** Map axe `accesskeys`; keep AST `no-accesskey`.
- [ ] **P0.8** Map remaining landmark uniqueness axe rules onto 12.6 checks.
- [ ] **P0.9** Split `color-contrast-enhanced` away from AA `color-contrast`.
- [ ] **P0.10** `consistent-help` as a site-level check (WCAG 3.2.6) — detect help/contact/chat links and compare order across routes.

### P1 — Deepen partial A/AA checks (same controls, better tests)

- [ ] **P1.1** Runtime **200% zoom / resize text** (10.4 / 1.4.4), distinct from `reflow` (320px).
- [ ] **P1.2** Time limits beyond meta-refresh (13.1 / 2.2.1): `setTimeout` navigation, `<meta http-equiv=refresh>`, JS session warnings.
- [ ] **P1.3** Moving content (13.8 / 2.2.2): CSS animation, carousels; respect `prefers-reduced-motion` only as a hint, not a pass.
- [ ] **P1.4** `audio-caption` accept adjacent transcript (`<a>` to transcript, `aria-describedby`).
- [ ] **P1.5** `video-caption` HEUR for known embed hosts (`youtube.com`, `vimeo.com`) as `unable_to_verify` / warning — never a pass.
- [ ] **P1.6** Audio-description track presence HEUR for 4.5 (`kind="descriptions"`).
- [ ] **P1.7** 11.5 grouping: related checkboxes / consecutive identity fields without `fieldset`.
- [ ] **P1.8** 10.14 runtime: CSS `:hover` content not in a focusable tree.
- [ ] **P1.9** 10.2 css-disabled-content: scan all hits, include background-image text, CSS-off snapshot.
- [ ] **P1.10** 8.6 site-level: duplicate document titles across routes (pertinence HEUR).
- [ ] **P1.11** 6.1 HEUR: “click here” / “read more” / “ici” / “en savoir plus” without accessible extra context.
- [ ] **P1.12** 13.2: `target="_blank"` without `noopener` warning text / `aria-describedby`.
- [ ] **P1.13** 13.3 HEUR: office/PDF links without an adjacent HTML alternative.
- [ ] **P1.14** `label-title-only` axe mapping onto `input-label` (title is not a name).
- [ ] **P1.15** Promote 4.12 (`media-keyboard-static`) from MAN to AST/runtime for object/embed.

### P2 — Site-level navigation (12.4, 12.5, 12.6, 3.2.6)

- [ ] **P2.1** Snapshot: sitemap link presence and selector-stable position (12.4).
- [ ] **P2.2** Snapshot: search control presence and position (12.5).
- [ ] **P2.3** Snapshot: `header` / `nav` / `main` / `footer` / search landmarks on every route (12.6).
- [ ] **P2.4** Help-link order (P0.10) plus “same relative order” documentation in guidance.

### P3 — Honesty about heuristics (do not auto-pass)

For HEUR checks, assessment must not mark the requirement `passed` when the engine only proved “no suspicious pattern”. Options (pick one in implementation, apply consistently):

1. Treat listed HEUR check ids like runtime-only: empty scan → `unable_to_verify`.
2. Or keep `passed` but surface “automated subset only” on the requirement.

Candidates: `image-detailed-description`, `image-of-text`, `table-summary`, `sensory-characteristics`, `error-suggestion`, `pointer-gesture`, `pointer-cancellation`, `motion-actuation`, `focus-context-change`, `input-context-change`, `blockquote-cite` (as currently scoped).

- [ ] **P3.1** Encode the policy in `check-authority.ts` + assessment-status tests.
- [ ] **P3.2** UI copy: “Presence checked; pertinence needs a human” for MAN twins (1.3, 2.2, 4.2, 4.4, 5.2, 5.5, 6.1, 8.6, 11.2, 11.7, 11.9).

### P4 — Later / do not automate

Leave as human controls; do not invent detectors:

- CAPTCHA alternative quality (1.4, 1.5)
- Pertinence of alts, captions, transcripts, AD, table summaries, labels, legends, titles (all `*-relevant`)
- Flashing / seizure (13.7 / 2.3.1)
- Office document internal accessibility (13.3/13.4) beyond “is there a link”
- Live captions (1.2.4) unless the product adds live-stream analysis
- Full HTML validity (8.2)
- WCAG AAA except opt-in human controls
- Reading level, pronunciation, unusual words (3.1.3–3.1.6)

## Suggested implementation order

| Wave | Scope | Outcome |
| --- | --- | --- |
| 0 | Catalog hygiene P0.1–P0.4 | Full RGAA lists 106 criteria; presets and codes are true |
| 1 | Image/media AST P0.5–P0.6, P1.4–P1.6, P1.15 | 1.1 and 4.8 match RGAA element list in CI |
| 2 | Axe mapping + landmarks P0.7–P0.9, P1.14 | Runtime fills 1.1.4, 12.6, 12.10 without new Playwright |
| 3 | Site-level P0.10, P2 | 12.4, 12.5, 3.2.6 become evidence-bearing |
| 4 | Runtime deepening P1.1–P1.3, P1.8–P1.9 | 10.4, 10.14, 13.1, 13.8 closer to the method |
| 5 | Honesty P3 + remaining HEUR P1.10–P1.13 | Statuses match what the engine actually proved |

Do not add checks that only exist to inflate coverage. Every new `CheckId` needs: tests (violation + clean), guidance, control mapping, authority class, and a developer-facing `reason`.

## Sources

- [RGAA 4.1.2 — Critères et tests](https://accessibilite.numerique.gouv.fr/methode/criteres-et-tests/)
- [WCAG 2.2 How to Meet (Quickref)](https://www.w3.org/WAI/WCAG22/quickref/)
- [WCAG 2.2 understanding — what’s new](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)
- DINUM `criteres.json` via [DISIC/accessibilite.numerique.gouv.fr](https://github.com/DISIC/accessibilite.numerique.gouv.fr)
- axe-core 4.13 `getRules()` vs `src/analysis/runtime/axe-map.ts`

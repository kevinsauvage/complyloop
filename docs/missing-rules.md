# Coverage gaps: RGAA 4.1.2 and WCAG 2.2

Prioritized work to close the gap between the official methods and what ComplyLoop can actually verify. Architecture overview: [`docs/ai/architecture.md`](./ai/architecture.md). Implementation plan: [`docs/superpowers/plans/2026-09-01-rgaa-wcag-coverage.md`](./superpowers/plans/2026-09-01-rgaa-wcag-coverage.md).

**Analyzed:** 2026-09-01 against [RGAA 4.1.2 critères et tests](https://accessibilite.numerique.gouv.fr/methode/criteres-et-tests/) (106 criteria, 258 tests) and [WCAG 2.2 How to Meet](https://www.w3.org/WAI/WCAG22/quickref/) (86 success criteria after 4.1.1 is obsolete). DINUM source count confirmed via [criteres.json](https://github.com/DISIC/accessibilite.numerique.gouv.fr).

**Last doc refresh:** 2026-09-01 — reflects Waves 0–4 shipped on `feat/rgaa-wcag-coverage-wave1` (catalog hygiene, AST/runtime deepening, site-level 12.4/12.5/12.6, heuristic honesty).

## Snapshot

| Surface | Count | Notes |
| --- | ---: | --- |
| RGAA 4.1.2 criteria | 106 | Legal method for French public sector; WCAG 2.1 A/AA transposed |
| Criteria with ≥1 catalog control | **106** | Regression test in `catalog-coverage.test.ts` |
| Catalog controls | **146** | Shared RGAA/WCAG catalog in `src/adapters/rgaa/controls.ts` |
| Controls with a machine check | **108** | AST, runtime, or site-level |
| Human-only controls (`checkId: null`) | **38** | Stay `unable_to_verify` until a human pass or exception |
| AST checks | **69** | CI / `complyloop-check` |
| Runtime-only checks | **40** | Need `runtimeBaseUrl` (includes site-level subset) |
| Site-level checks | **8** | Need ≥2 preview routes |
| Unique WCAG SCs referenced | 55 | WCAG 2.2 has 86 SCs (50 A/AA + 36 AAA) |
| axe-core 4.13 rules | 105 | **109 mapped** (88 + wave-1 landmark/accesskeys/img-map); 17 ignored (mostly best-practice) |

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

A requirement is never `passed` from an empty scan for runtime-only, heuristic, or manual controls. Heuristic AST checks that emit nothing stay `unable_to_verify` (Wave 4).

## Current engine inventory

**AST (69):** img-alt, button-name, anchor-name, html-lang, positive-tabindex, input-label, heading-order, empty-heading, iframe-title, autoplay-media, duplicate-id, form-error-association, aria-hidden-focusable, aria-role, aria-props, aria-required-attr, no-autofocus, keyboard-interaction, meta-viewport, list-structure, autocomplete-valid, pointer-gesture, pointer-cancellation, motion-actuation, focus-context-change, input-context-change, sensory-characteristics, image-of-text, error-suggestion, video-caption, audio-caption, no-blink-marquee, text-spacing, empty-th, dialog-name, tab-name, summary-name, p-as-heading, fieldset-legend, autocomplete-purpose, no-accesskey, optgroup, table-caption, table-summary, th-scope, layout-table-markup, svg-name, figure-caption, image-detailed-description, redundant-role, noninteractive-tabindex, aria-activedescendant, accessible-auth, dragging, new-window-onload, dir-change, blockquote-cite, outline-none, status-live, both-colors, redundant-entry, media-controls-present, nontemporal-media-alt, field-grouping, no-auto-refresh, audio-description-track, link-explicit-heuristic, office-docs-alt-present, media-keyboard-static.

**Runtime-only (40):** color-contrast, document-title, bypass, landmark-one-main, nested-interactive, target-size, table-headers, page-heading, content-region, label-in-name, lang-parts, html-lang-valid, aria-roledescription, presentation-role, no-auto-refresh, no-orientation-lock, landmark-unique, use-of-color, frame-keyboard, doctype, focus-visible, keyboard-trap, focus-not-obscured, non-text-contrast, reflow, resize-text, text-spacing-runtime, hover-content, label-adjacent, both-colors (runtime twin), css-disabled-content, css-hover-keyboard, media-keyboard, multiple-ways, consistent-nav, consistent-labels, consistent-help, consistent-sitemap, consistent-search, consistent-landmarks, duplicate-page-title.

**Site-level (8):** multiple-ways, consistent-nav, consistent-labels, consistent-help, consistent-sitemap, consistent-search, consistent-landmarks, duplicate-page-title.

## RGAA 4.1.2 — criterion map

### 1. Images

| Crit. | Official question (short) | Status | What we have | Gap |
| --- | --- | --- | --- | --- |
| 1.1 | Informative image has a text alternative | **AST+RT** | `img-alt` (img/Image, area, input image, role=img, object/embed image, canvas, ismap), `svg-name` (requires `role="img"`), axe `server-side-image-map` | Runtime still owns some hosts when composition-sensitive; pertinence stays human (1.3) |
| 1.2 | Decorative image ignored by AT | **MAN** | `ctl-decorative-ignored` | Presence of `alt=""` / `role="presentation"` is machine-checkable; whether the image is decorative is human |
| 1.3 | Alternative is pertinent | **MAN** | `ctl-img-alt-relevant` | Keep human. Generic-alt warning on `img-alt` is a useful HEUR, not a 1.3 pass |
| 1.4 | CAPTCHA alt identifies function | **MAN** | `ctl-captcha-alt` | Stay human |
| 1.5 | CAPTCHA has a non-image alternative | **MAN** | `ctl-captcha-alternative` | Human control added (wave 0). Optional HEUR still open |
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
| 3.1 | Information is not color-only | **MAN** | `ctl-info-not-color-only` | Charts, required fields, status — human. Link underline is `use-of-color` / 10.6 |
| 3.2 | Text contrast ≥ 4.5:1 (3:1 large) | **RT** | `color-contrast` (axe) | AAA `color-contrast-enhanced` no longer folded into AA (wave 1) |
| 3.3 | Non-text contrast (UI / graphics) | **RT** | `non-text-contrast` custom | Keep; do not claim completeness for complex graphics |

### 4. Multimedia

| Crit. | Official question | Status | What we have | Gap |
| --- | --- | --- | --- | --- |
| 4.1 | Prerecorded temporal media has transcript or AD | **PART** | `audio-caption` (track, adjacent transcript link, or `aria-describedby`) | `<video>` audio-only and custom players still partial. Live media is N/A |
| 4.2 | Transcript / AD is pertinent | **MAN** | `ctl-transcript-relevant` | Stay human |
| 4.3 | Prerecorded synchronized media has captions | **PART** | `video-caption` (`<track kind=captions\|subtitles>`) + HEUR warning on YouTube/Vimeo iframes | Native `<video>` is a hard fail without a track. Embeds are warning / never a silent pass. Custom players still open |
| 4.4 | Captions are pertinent | **MAN** | `ctl-captions-relevant` | Stay human |
| 4.5 | Synchronized audio description when needed | **HEUR** | `audio-description-track` on `ctl-audio-description` | Warning when `<video>` lacks `kind="descriptions"` — not a hard pass of 4.5 |
| 4.6 | Audio description is pertinent | **MAN** | `ctl-audio-description-relevant` | Human control added (wave 0) |
| 4.7 | Media is clearly identifiable | **MAN** | `ctl-media-identification` | Stay human (name/context of the player) |
| 4.8 | Non-temporal media has an alternative | **AST** | `nontemporal-media-alt` | object/embed/canvas without name or adjacent alternative |
| 4.9 | That alternative is pertinent | **MAN** | `ctl-nontemporal-media-alt-relevant` | Human control added (wave 0) |
| 4.10 | Autoplay sound is controllable | **AST+RT** | `autoplay-media` + axe `no-autoplay-audio` | Solid for `autoPlay`. JS-triggered audio needs runtime |
| 4.11 | Temporal media operable by keyboard | **AST+RT** | `media-controls-present`, `media-keyboard` | Good presence check; custom players remain HEUR |
| 4.12 | Non-temporal media operable by keyboard | **AST** | `media-keyboard-static` | object/embed without tabIndex or keyboard handlers |
| 4.13 | Media compatible with AT | **MAN** | `ctl-media-at-compatible` | Human control added (wave 0) |

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
| 6.1 | Link is explicit (purpose) | **HEUR** | `link-explicit-heuristic` on `ctl-link-explicit` | Warning on “click here” / “read more” / “ici” — pertinence still human |
| 6.2 | Link has an accessible name | **AST+RT** | `anchor-name` | Solid |

### 7. Scripts

| Crit. | Official question | Status | What we have | Gap |
| --- | --- | --- | --- | --- |
| 7.1 | Script compatible with AT (name/role/value) | **AST+RT** | aria-role/props/required-attr, dialog/tab/summary-name, activedescendant, roledescription | Broad but not every ARIA widget. Unmapped axe: `aria-allowed-role`, `aria-treeitem-name`, `aria-text` |
| 7.2 | Script alternative is pertinent | **MAN** | `ctl-script-alternative-relevant` | Stay human |
| 7.3 | Script operable by keyboard | **PART** | `keyboard-interaction` (RGAA 7.3), `frame-keyboard`, `ctl-supplementary-content-keyboard` (12.11) | 12.11 extra-content keyboard is separate from 7.3 script operability |
| 7.4 | Context change initiated by script is controlled | **HEUR** | `focus-context-change`, `input-context-change` | AST of handlers is incomplete vs real navigation |
| 7.5 | Status messages exposed to AT | **AST** | `status-live` | Presence of live region / `role="status"` heuristics; dynamic toasts need runtime |

### 8. Mandatory elements

| Crit. | Official question | Status | What we have | Gap |
| --- | --- | --- | --- | --- |
| 8.1 | Doctype present | **RT** | `doctype` | Solid |
| 8.2 | Generated source valid for the doctype | **PART** | `duplicate-id` (unique IDs slice) | Wording fixed (wave 0); full HTML validity stays out of scope |
| 8.3 | Default language present | **AST+RT** | `html-lang` | Solid |
| 8.4 | Language code pertinent / valid | **RT** | `html-lang-valid` | Valid BCP 47 ≠ pertinent (page is actually French). Validity automated; pertinence human |
| 8.5 | Page has a title | **RT** | `document-title` | Solid |
| 8.6 | Page title pertinent | **HEUR+MAN** | `duplicate-page-title` (site-level uniqueness) + `ctl-page-title-relevant` | Unique titles can pass the sibling control; wording pertinence stays human |
| 8.7 | Language changes indicated | **MAN** | `ctl-lang-change-indicated` | Human control added (wave 0). `lang-parts` covers 8.8 validity |
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
| 10.1 | CSS used to control presentation | **MAN** | `ctl-css-for-presentation` | Human control added (wave 0) |
| 10.2 | Informative content still present with CSS off | **RT** | `css-disabled-content` | Reports **all** pseudo-element / background-text hits (wave 2). Full CSS-off linearization still open |
| 10.3 | Content still understandable with CSS off | **MAN** | `ctl-css-off-understandable` | Human control added (wave 0). Reading-order snapshot still open |
| 10.4 | Text readable at 200% zoom | **PART** | `meta-viewport`, `resize-text` (runtime) | Viewport lock + 200% resize at 320px. Distinct from `reflow` (10.11) |
| 10.5 | CSS color and background used together | **AST+RT** | `both-colors` | Solid |
| 10.6 | Links obvious vs surrounding text | **RT** | `use-of-color` ← axe `link-in-text-block` | Recoded to 10.6 (wave 0); 3.1 is separate human control |
| 10.7 | Focus visible | **AST+RT** | `outline-none`, `focus-visible` | Strong |
| 10.8 | Hidden content intended to be ignored by AT | **MAN** | `ctl-hidden-content-ignored` | Overlaps `aria-hidden-focusable`. Promote a runtime check for visually hidden but still in the a11y tree (or vice versa) |
| 10.9 | Info not by shape/size/position alone | **HEUR** | `sensory-characteristics` | Copy heuristics. Stay warning |
| 10.10 | That rule implemented pertinently | **MAN** | `ctl-sensory-rule-relevant` | Stay human |
| 10.11 | Reflow 320×256 | **RT** | `reflow` | Solid |
| 10.12 | Text spacing override | **AST+RT** | `text-spacing`, `text-spacing-runtime` | Solid |
| 10.13 | Hover/focus extra content controllable | **RT** | `hover-content` | Solid start |
| 10.14 | CSS-only extra content available to keyboard | **RT** | `css-hover-keyboard` | `:hover` without `:focus` parity (wave 2). Distinct from 10.13 dismiss/hoverable |

### 11. Forms

| Crit. | Official question | Status | What we have | Gap |
| --- | --- | --- | --- | --- |
| 11.1 | Field has a label | **AST+RT** | `input-label`, `label-in-name` (WCAG 2.5.3) | `label-in-name` recoded to WCAG 2.5.3 (wave 0). axe `label-title-only` mapped |
| 11.2 | Label is pertinent | **MAN** | `ctl-label-relevant` | Stay human |
| 11.3 | Same-purpose labels consistent | **SITE** | `consistent-labels` | Needs ≥2 routes |
| 11.4 | Label adjacent to field | **RT** | `label-adjacent` | Solid |
| 11.5 | Same-nature fields grouped when needed | **AST** | `field-grouping` | Related checkboxes / identity clusters without fieldset (wave 1) |
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
| 12.4 | Sitemap reachable via identical control | **SITE** | `consistent-sitemap` on `ctl-search-relevant` | Sitemap link presence and DOM-path position across routes (wave 3) |
| 12.5 | Search reachable via identical control | **SITE** | `consistent-search` on `ctl-nav-mechanisms-relevant` | Search control presence and position across routes (wave 3) |
| 12.6 | Landmark regions can be reached or skipped | **PART+SITE** | `landmark-one-main`, `landmark-unique`, `consistent-landmarks` | Per-page axe + cross-route banner/main consistency (wave 3). axe landmark rules mapped |
| 12.7 | Skip link to main | **RT** | `bypass` | `no-autofocus` recoded to 13.2 (wave 0) |
| 12.8 | Tab order coherent | **PART** | `positive-tabindex`, `noninteractive-tabindex` + MAN `ctl-focus-order-logical` | Positive tabindex ≠ visual vs DOM order. Runtime `focus-order-semantics` is unmapped best-practice |
| 12.9 | No keyboard trap | **RT** | `keyboard-trap` | Solid |
| 12.10 | Single-key shortcuts user-controllable | **PART** | `no-accesskey` + axe `accesskeys` | RGAA/WCAG 2.1.4 allow shortcuts if remappable. axe `accesskeys` mapped (wave 1) |
| 12.11 | Extra content on hover/focus/activation reachable by keyboard | **PART** | `hover-content`, `css-hover-keyboard`, `ctl-supplementary-content-keyboard` | 10.13 dismiss + 10.14 hover/focus parity + human 12.11 pertinence |

### 13. Consultation

| Crit. | Official question | Status | What we have | Gap |
| --- | --- | --- | --- | --- |
| 13.1 | User controls each time limit | **PART** | `no-auto-refresh` (meta refresh + AST timer warnings) | JS session timeouts and carousels still open |
| 13.2 | New window not without user action | **AST** | `new-window-onload` | `window.open` on mount + `target="_blank"` without warning (wave 2) |
| 13.3 | Office download has an accessible version | **HEUR+MAN** | `office-docs-alt-present` + `ctl-office-docs-alt` | HEUR: PDF/DOC links without adjacent HTML alternative; pertinence/equivalence human |
| 13.4 | That accessible version is equivalent | **MAN** | `ctl-office-docs-equivalent` | Human control added (wave 0) |
| 13.5 | Cryptic content (ASCII art, emoji clusters) has an alternative | **MAN** | `ctl-cryptic-content-alt` | Human control added (wave 0) |
| 13.6 | That alternative is pertinent | **MAN** | `ctl-cryptic-content-alt-relevant` | Human control added (wave 0) |
| 13.7 | Flashes below threshold | **MAN** | `ctl-flash-threshold` | Stay human (WCAG 2.3.1). Do not fake a seizure check |
| 13.8 | Moving / blinking content controllable | **PART** | `no-blink-marquee` (blink/marquee fail; CSS animation, Tailwind `animate-*`, carousel hosts warn) | Duration > 5s and pause-control presence stay out of AST. `prefers-reduced-motion` is not a pass |
| 13.9 | Content usable in any orientation | **RT** | `no-orientation-lock` | Code fixed to `RGAA 13.9` (wave 0). axe `css-orientation-lock` mapped |
| 13.10 | Complex pointer gesture has a simple alternative | **HEUR** | `pointer-gesture` | AST of handlers |
| 13.11 | Single-pointer action cancellable | **HEUR** | `pointer-cancellation` | AST of handlers |
| 13.12 | Motion actuation has an alternative | **HEUR** | `motion-actuation` | AST of handlers |

## WCAG 2.2 — success criteria map

Catalog is labeled **WCAG 2.2** (`fw-wcag-2-1` id unchanged). Presets: Full / AA / “extra checks” (not “WCAG AAA”).

### Level A (must for AA products)

| SC | Name | Coverage |
| --- | --- | --- |
| 1.1.1 | Non-text Content | PART (see RGAA 1.x) |
| 1.2.1 | Audio-only and Video-only (Prerecorded) | PART (`audio-caption`) |
| 1.2.2 | Captions (Prerecorded) | PART (`video-caption` + YouTube/Vimeo HEUR) |
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
| 2.2.2 | Pause, Stop, Hide | PART (blink/marquee + CSS animation / carousel HEUR) |
| 2.3.1 | Three Flashes or Below Threshold | MAN |
| 2.4.1 | Bypass Blocks | RT |
| 2.4.2 | Page Titled | RT + SITE uniqueness HEUR + MAN pertinence |
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
| 1.2.5 | Audio Description (Prerecorded) | HEUR (`audio-description-track`) + MAN pertinence |
| 1.3.4 | Orientation | RT |
| 1.3.5 | Identify Input Purpose | AST |
| 1.4.3 | Contrast (Minimum) | RT |
| 1.4.4 | Resize Text | PART (`meta-viewport` + `resize-text` runtime) |
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
| 3.2.6 | Consistent Help (2.2) | **SITE** `consistent-help` |
| 3.3.3 | Error Suggestion | HEUR |
| 3.3.4 | Error Prevention (Legal, Financial, Data) | MAN |
| 3.3.8 | Accessible Authentication (Minimum) (2.2) | AST |
| 4.1.3 | Status Messages | AST |

### Level AAA — do not pretend we cover these

No dedicated automated coverage (and the AAA preset must not imply otherwise): 1.2.6, 1.2.7, 1.2.8, 1.2.9, 1.3.6, 1.4.6, 1.4.7, 1.4.8, 1.4.9, 2.1.3, 2.2.3, 2.2.4, 2.2.5, 2.2.6, 2.3.2, 2.3.3, 2.4.8, 2.4.9 (axe `identical-links-same-purpose` unmapped), 2.4.10, 2.4.12, 2.4.13, 2.5.5, 2.5.6, 3.1.3, 3.1.4, 3.1.5, 3.1.6, 3.2.5, 3.3.5, 3.3.6, 3.3.9.

`color-contrast-enhanced` currently reports as AA `color-contrast` — stop folding AAA 1.4.6 into AA 1.4.3.

`color-contrast-enhanced` is **not** folded into AA `color-contrast` (fixed wave 1).

## Catalog hygiene

**Resolved in Waves 0–1** (keep for audit trail):

1. ~~Invalid code `RGAA 13.9.1`~~ → `RGAA 13.9`.
2. ~~15 criteria absent from the catalog~~ → all 106 criteria now have ≥1 control.
3. ~~12.4 / 12.5 wrong titles~~ → recoded; site checks wired in wave 3.
4. ~~`no-autofocus` on 12.7~~ → recoded to 13.2.
5. ~~`lang-parts` on 8.8 only~~ → 8.7 human control added; 8.8 validity via `lang-parts`.
6. ~~`empty-heading` on 9.2~~ → recoded to 9.1.
7. ~~`label-in-name` on 11.1~~ → WCAG 2.5.3.
8. ~~`keyboard-interaction` on 12.11~~ → primary 7.3; 12.11 human `ctl-supplementary-content-keyboard`.
9. ~~`duplicate-id` claiming full 8.2 validity~~ → wording fixed.
10. ~~AA/AAA preset duplicate control ids~~ → deduplicated.
11. ~~WCAG adapter still named 2.1~~ → display name 2.2.
12. ~~AAA presets imply WCAG AAA~~ → renamed “extra checks”.

**Still open:**

- Expand `fieldset-legend` to checkbox clusters (11.6).
- `empty-th` does not catch styled `<td>` headers (5.6).
- `blockquote-cite` only fires when `cite` exists (9.4 partial).

## Unmapped axe-core rules worth a decision

| axe id | WCAG / notes | Status |
| --- | --- | --- |
| ~~`server-side-image-map`~~ | 1.1.1 / RGAA 1.1.4 | **Mapped** → `img-alt` (wave 1) |
| ~~`accesskeys`~~ | 2.1.4 / RGAA 12.10 | **Mapped** → `no-accesskey` (wave 1) |
| ~~`landmark-banner-is-top-level`~~ | 1.3.1 / 12.6 | **Mapped** → `landmark-one-main` (wave 1) |
| ~~`landmark-contentinfo-is-top-level`~~ | same | **Mapped** → `landmark-one-main` |
| ~~`landmark-no-duplicate-banner`~~ | same | **Mapped** → `landmark-unique` |
| ~~`landmark-no-duplicate-contentinfo`~~ | same | **Mapped** → `landmark-unique` |
| ~~`label-title-only`~~ | best-practice | **Mapped** → `input-label` (wave 1) |
| `identical-links-same-purpose` | 2.4.9 AAA | Only if we add an AAA control |
| `hidden-content` | best-practice | Consider for 10.8 runtime |
| `aria-allowed-role` | best-practice | Optional 7.1 |
| `aria-treeitem-name` | best-practice | Optional 7.1 |
| `frame-tested`, `focus-order-semantics`, `image-redundant-alt`, `table-duplicate-name`, `aria-text` | best-practice | Ignore unless a criterion needs them |

## Prioritized to-do

Priority is **legal + automatable + currently silent or lying**, not “everything DINUM lists”. Pertinence, flashing, reading level, and office-document equivalence stay human.

### P0 — Stop lying, then close silent A/AA holes

Catalog and mapping first so new checks land on the right control.

- [x] **P0.1** Add the 15 missing RGAA controls (human unless a check is listed below). Fix `RGAA 13.9.1`. Deduplicate presets.
- [x] **P0.2** Recode mismapped controls (8.7/8.8, 9.1/9.2, 10.6 vs 3.1, 11.1 vs 2.5.3, 11.5 vs 11.6, 12.4, 12.5, 12.7 vs autofocus, 12.11 vs 7.3, 8.2 wording).
- [x] **P0.3** Rename WCAG framework/presets to **2.2**. AAA preset: either real AAA human controls or a name that does not say “WCAG AAA”.
- [x] **P0.4** Coverage regression test: every RGAA 4.1.2 id `1.1`–`13.12` has ≥1 control; no duplicate ids in a preset.
- [x] **P0.5** Expand `img-alt` AST to `area`, `input type="image"`, `role="img"`, `object[type^=image]`, `embed`, `canvas`. Map `server-side-image-map`. Require `role="img"` on informative SVG (1.1.5) in `svg-name`.
- [x] **P0.6** Non-temporal media alternative (4.8) AST for `object` / `embed` / `canvas` without a name or adjacent alternative.
- [x] **P0.7** Map axe `accesskeys`; keep AST `no-accesskey`.
- [x] **P0.8** Map remaining landmark uniqueness axe rules onto 12.6 checks.
- [x] **P0.9** Split `color-contrast-enhanced` away from AA `color-contrast`.
- [x] **P0.10** `consistent-help` as a site-level check (WCAG 3.2.6) — detect help/contact/chat links and compare order across routes.

### P1 — Deepen partial A/AA checks (same controls, better tests)

- [x] **P1.1** Runtime **200% zoom / resize text** (10.4 / 1.4.4), distinct from `reflow` (320px).
- [x] **P1.2** Time limits beyond meta-refresh (13.1 / 2.2.1): AST warnings for `setTimeout`/`setInterval` navigation. Session timeouts / carousels still open.
- [x] **P1.3** Moving content (13.8 / 2.2.2): CSS animation, carousels; respect `prefers-reduced-motion` only as a hint, not a pass.
- [x] **P1.4** `audio-caption` accept adjacent transcript (`<a>` to transcript, `aria-describedby`).
- [x] **P1.5** `video-caption` HEUR for known embed hosts (`youtube.com`, `vimeo.com`) as `unable_to_verify` / warning — never a pass.
- [x] **P1.6** Audio-description track presence HEUR for 4.5 (`kind="descriptions"`).
- [x] **P1.7** 11.5 grouping: related checkboxes / consecutive identity fields without `fieldset`.
- [x] **P1.8** 10.14 runtime: CSS `:hover` content not in a focusable tree (`css-hover-keyboard`).
- [x] **P1.9** 10.2 css-disabled-content: scan all hits (full CSS-off snapshot still open).
- [x] **P1.10** 8.6 site-level: duplicate document titles across routes (pertinence HEUR).
- [x] **P1.11** 6.1 HEUR: “click here” / “read more” / “ici” / “en savoir plus” without accessible extra context.
- [x] **P1.12** 13.2: `target="_blank"` without warning text / `aria-describedby`.
- [x] **P1.13** 13.3 HEUR: office/PDF links without an adjacent HTML alternative (`office-docs-alt-present`).
- [x] **P1.14** `label-title-only` axe mapping onto `input-label` (title is not a name).
- [x] **P1.15** Promote 4.12 (`media-keyboard-static`) from MAN to AST for object/embed.

### P2 — Site-level navigation (12.4, 12.5, 12.6, 3.2.6)

- [x] **P2.1** Snapshot: sitemap link presence and selector-stable position (12.4) → `consistent-sitemap`.
- [x] **P2.2** Snapshot: search control presence and position (12.5) → `consistent-search`.
- [x] **P2.3** Snapshot: `header` / `nav` / `main` / `footer` / search landmarks on every route (12.6) → `consistent-landmarks`.
- [x] **P2.4** Help-link order (P0.10) plus guidance on `consistent-help`.

### P3 — Honesty about heuristics (do not auto-pass)

For HEUR checks, assessment must not mark the requirement `passed` when the engine only proved “no suspicious pattern”. Options (pick one in implementation, apply consistently):

1. Treat listed HEUR check ids like runtime-only: empty scan → `unable_to_verify`.
2. Or keep `passed` but surface “automated subset only” on the requirement.

Candidates: `image-detailed-description`, `image-of-text`, `table-summary`, `sensory-characteristics`, `error-suggestion`, `pointer-gesture`, `pointer-cancellation`, `motion-actuation`, `focus-context-change`, `input-context-change`, `audio-description-track`, `link-explicit-heuristic`. `blockquote-cite` stays AST pass/fail for its narrow rule.

- [x] **P3.1** Encode the policy in `check-authority.ts` + assessment-status tests.
- [x] **P3.2** UI copy: “Presence checked; pertinence needs a human” for MAN twins (1.3, 2.2, 4.2, 4.4, 5.2, 5.5, 6.1, 8.6, 11.2, 11.7, 11.9).

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

| Wave | Scope | Outcome | Status |
| --- | --- | --- | --- |
| 0 | Catalog hygiene P0.1–P0.4 | Full RGAA lists 106 criteria; presets and codes are true | **Done** |
| 1 | Image/media AST P0.5–P0.6, P1.4–P1.6, P1.15, axe P0.7–P0.9 | 1.1 and 4.8 match RGAA element list in CI; landmarks mapped | **Done** |
| 2 | Runtime deepening P1.1–P1.2, P1.8–P1.9, P1.11–P1.13, P1.14 | 10.4, 10.14, 13.1/13.2/13.3, 6.1 closer to the method | **Done** |
| 3 | Site-level P0.10, P2 | 12.4, 12.5, 12.6, 3.2.6 become evidence-bearing | **Done** |
| 4 | Honesty P3 + remaining HEUR P1.3, P1.5, P1.10 | Statuses match what the engine actually proved | **Done** |

Do not add checks that only exist to inflate coverage. Every new `CheckId` needs: tests (violation + clean), guidance, control mapping, authority class, and a developer-facing `reason`.

## Sources

- [RGAA 4.1.2 — Critères et tests](https://accessibilite.numerique.gouv.fr/methode/criteres-et-tests/)
- [WCAG 2.2 How to Meet (Quickref)](https://www.w3.org/WAI/WCAG22/quickref/)
- [WCAG 2.2 understanding — what’s new](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)
- DINUM `criteres.json` via [DISIC/accessibilite.numerique.gouv.fr](https://github.com/DISIC/accessibilite.numerique.gouv.fr)
- axe-core 4.13 `getRules()` vs `src/analysis/runtime/axe-map.ts`

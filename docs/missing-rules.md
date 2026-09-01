# Missing RGAA / WCAG rules

Coverage gap for the accessibility MVP. Goal: cover **as many RGAA 4.1.2 and WCAG 2.2 A/AA rules as we can score honestly** — automated when the engine can fail/pass with evidence, human-reviewed (`checkId: null`) when it cannot.

This is the backlog for new controls and checks. System shape stays in [`docs/ai/architecture.md`](./ai/architecture.md). Product loop stays in the spec.

**Sources:** RGAA 4.1.2 (DINUM, 106 criteria / 13 themes), WCAG 2.2 (W3C), current catalog in `src/adapters/rgaa/controls.ts`, AST registry in `src/analysis/checks/registry.ts`, axe map in `src/analysis/runtime/axe-map.ts` (axe-core 4.13, 105 rules).

When a row is implemented, delete it from this file and update the architecture check list.

---

## Snapshot (2026-08-31)

| Surface | Count | What it means |
| --- | ---: | --- |
| Catalog controls | 88 | 79 automated + 9 human-reviewed (`checkId: null`). Still not the full referential. |
| Unique WCAG SCs in the catalog | ~42 | Several controls share `4.1.2` or `1.3.1`. |
| Unique official RGAA criteria we approximate | ~40 of 106 | Many older catalog `code` values are still wrong (see [Mapping debt](#mapping-debt)). |
| AST checks | 57 | CI / `complyloop-check` source of truth. |
| Runtime-only checks | 22 | axe via Playwright + custom keyboard checks; `unable_to_verify` without a preview URL. |
| axe rules mapped | ~100 of 105 | Unmapped best-practice axe rules stay ignored on purpose. |
| Human-only controls (`checkId: null`) | 9 | Seeded pertinence/quality slots; never auto-passed. |
| WCAG 2.2 A+AA | 56 | Legal target (EAA / most contracts). AAA is out of MVP. |
| RGAA 4.1.2 | 106 | French operationalization of WCAG 2.1 A+AA. RGAA 5 (WCAG 2.2) is expected late 2026. |

Presence ≠ relevance. `img-alt` can prove an `alt` exists; it cannot prove the alternative is **pertinent** (RGAA 1.3). Do not auto-pass relevance criteria from a presence check.

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

## P0 — Promote axe rules we already run — shipped

Shipped: `video-caption`, `audio-caption`, `no-blink-marquee`, `text-spacing`, `use-of-color` (unmapped from `color-contrast`), `empty-th`, `dialog-name`, `tab-name`, `summary-name`, `frame-keyboard`, `p-as-heading`, `doctype` (Playwright `document.doctype` → synthetic `html-has-doctype`).

Do **not** promote remaining best-practice-only axe rules (`accesskeys`, `hidden-content`, `frame-tested`, landmark-duplicate-banner, …) until they map to a real RGAA/WCAG criterion we want to status.

---

## P1 — New AST checks (CI gate, no preview URL)

Shipped: `video-caption` / `audio-caption`, `fieldset-legend`, `autocomplete-purpose`, `no-accesskey`, `optgroup`, `table-caption`, `th-scope`, `layout-table-markup`, `svg-name`, `figure-caption`, `redundant-role`, `noninteractive-tabindex`, `aria-activedescendant`, `new-window-onload`, `dir-change`, `blockquote-cite`, `outline-none`, `status-live`.

---

## P2 — Runtime (Playwright ± axe), no honest AST pass

Shipped: `focus-visible`, `keyboard-trap`.

Still open:

| Proposed `checkId` | RGAA | WCAG | How | Why it matters |
| --- | --- | --- | --- | --- |
| `non-text-contrast` | 3.3 | 1.4.11 AA | Custom contrast on UI chrome (borders, icons, focus ring). axe does **not** ship this as a default rule in 4.13. | AA gap next to `color-contrast`. |
| `reflow` | 10.11 | 1.4.10 AA | Viewport 320 CSS px; fail on unexpected horizontal scroll of page content (except data tables, maps). | Mobile / zoom. |
| `text-spacing-runtime` | 10.12 | 1.4.12 AA | Inject WCAG spacing bookmarklet styles; fail on overlap/clip. Pair with P0 `text-spacing` for inline locks. | Completes 1.4.12. |
| `hover-content` | 10.13, 10.14, 12.11 | 1.4.13 AA | Pointer-hover / focus content is dismissable, hoverable, persistent; keyboard can reach it. | Tooltips, megamenus. |
| `label-adjacent` | 11.4 | 3.3.2 A | Visible label is programmatically tied **and** visually adjacent (computed geometry). | Forms. |
| `css-disabled-content` | 10.2 | 1.3.1 A | With CSS disabled (or `role`/`aria-*` stripped to structure), informative content is still in the DOM. | Rare to automate well; start with “text only in CSS `content:` / background-image”. |
| `both-colors` | 10.5 | 1.4.3 AA | Element sets `color` without `background-color` (or vice versa) so user stylesheets break contrast. | AST possible for inline styles; runtime for CSS. |
| `html-lang-valid` | 8.4 | 3.1.1 A | Already mapped onto `html-lang`. Split only if we want a separate requirement for BCP 47 validity vs presence. | Optional split. |

---

## P3 — WCAG 2.2 (not in RGAA 4.1.2)

Shipped: `focus-not-obscured`, `accessible-auth`, `dragging` (AST; runtime promotion later if needed). `target-size` (2.5.8) was already on both presets.

Still open:

| Proposed `checkId` | WCAG | Engine | What to flag |
| --- | --- | --- | --- |
| `consistent-help` | 3.2.6 A | Human first, then site crawl | Help / contact / chat in the same relative order on every page. Needs multi-route runtime. |
| `redundant-entry` | 3.3.7 A | Heuristic AST + human | Multi-step forms that re-ask data already collected (no autocomplete / hidden prior value). Easy to false-fail. |

`2.4.12`, `2.4.13`, `3.3.9` are AAA — defer.

---

## P4 — Human-only catalog (`checkId: null`) — seed shipped

Seeded so Full RGAA is not a silent subset. Status stays `unable_to_verify` until human pass or exception.

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

`ctl-color-not-only` was skipped: `use-of-color` is now a runtime-only control. Add remaining relevance/quality criteria from the appendix as the audit workflow needs them — not all 80 at once.

---

## Remaining RGAA 4.1.2 (A/AA) — not in P0–P3

Everything below is still a gap. Default engine is **human**. Promote a row into P0–P2 only when we have a deterministic test that can fail.

### 1. Images

| RGAA | WCAG | Title (official) | Engine |
| --- | --- | --- | --- |
| 1.4 | 1.1.1 | CAPTCHA / test image alternative identifies function | Human |
| 1.5 | 1.1.1 | CAPTCHA has a non-image alternative | Human |
| 1.6 | 1.1.1 | Complex image has a detailed description when needed | Human (+ weak AST: `aria-describedby` / `longdesc` presence) |
| 1.7 | 1.1.1 | Detailed description is pertinent | Human |
| 1.8 | 1.4.5 | Image of text replaced by styled text when possible | Partial: today's `image-of-text` heuristic (fix the RGAA code) |

### 2. Frames

| RGAA | WCAG | Title | Engine |
| --- | --- | --- | --- |
| 2.2 | 4.1.2 | Frame title is pertinent | P4 |

### 3. Colors

Covered by P0 `use-of-color`, P2 `non-text-contrast`, existing `color-contrast`.

### 4. Multimedia (quality + control)

| RGAA | WCAG | Title | Engine |
| --- | --- | --- | --- |
| 4.2 | 1.2.1 / 1.2.3 | Transcript / audio-description is pertinent | Human |
| 4.4 | 1.2.2 | Captions are pertinent | P4 |
| 4.5 | 1.2.5 AA | Synchronized audio-description when needed | Human (presence of AD track is a weak AST) |
| 4.6 | 1.2.5 | Audio-description is pertinent | Human |
| 4.7 | 1.1.1 | Temporal media is clearly identifiable | Human |
| 4.8 | 1.1.1 | Non-temporal media has an alternative | Human |
| 4.9 | 1.1.1 | That alternative is pertinent | Human |
| 4.11 | 2.1.1 | Temporal media controllable by keyboard and pointer | Runtime (player chrome) |
| 4.12 | 2.1.1 | Non-temporal media controllable by keyboard and pointer | Runtime |
| 4.13 | 4.1.2 | Media compatible with assistive tech | Human / runtime |

### 5. Tables

| RGAA | WCAG | Title | Engine |
| --- | --- | --- | --- |
| 5.1 | 1.3.1 | Complex data table has a summary | AST heuristic (`aria-describedby` / `summary`) |
| 5.2 | 1.3.1 | Summary is pertinent | Human (today's `table-headers` must not keep this code) |
| 5.3 | 1.3.2 | Layout table still makes sense linearized | Human |
| 5.5 | 1.3.1 | Table title is pertinent | Human |

### 6. Links

6.2 (has a name) is covered. 6.1 (explicit) is P4.

### 7. Scripts

| RGAA | WCAG | Title | Engine |
| --- | --- | --- | --- |
| 7.2 | 4.1.2 | Script alternative is pertinent | Human |
| 7.3 | 2.1.1 | Script controllable by keyboard and pointer | Partial `keyboard-interaction`; rest is runtime |
| 7.4 | 3.2.1 / 3.2.2 | User is warned or in control of context changes | Partial `focus-context-change` / `input-context-change` |

### 8. Mandatory elements

| RGAA | WCAG | Title | Engine |
| --- | --- | --- | --- |
| 8.2 | 4.1.1 obsolete | Generated source is valid | Don't run a full HTML validator in MVP; keep `duplicate-id` as the useful slice |
| 8.6 | 2.4.2 | Page title is pertinent | P4 |
| 8.9 | 1.3.1 | Markup not used for presentation only | Partial (`presentation-role`, `p-as-heading`) |

### 9. Structure

9.1–9.3 partial via headings/lists. 9.4 quotes → P1 `blockquote-cite` (weak).

### 10. Presentation

| RGAA | WCAG | Title | Engine |
| --- | --- | --- | --- |
| 10.1 | 1.3.1 | CSS used to control presentation | Human / N/A for React apps that already use CSS |
| 10.3 | 1.3.2 | Content still understandable with CSS off | Human |
| 10.6 | 1.4.1 | Non-obvious links distinguishable from surrounding text | P0 `use-of-color` |
| 10.8 | 4.1.2 | Hidden content is *meant* to be ignored by AT | Human (`aria-hidden` vs visually hidden) |
| 10.9 | 1.3.3 | Information not by shape/size/position alone | Partial `sensory-characteristics` (fix the RGAA code) |
| 10.10 | 1.3.3 | That rule is implemented pertinently | Human |

### 11. Forms

| RGAA | WCAG | Title | Engine |
| --- | --- | --- | --- |
| 11.2 | 3.3.2 | Label is pertinent | P4 |
| 11.3 | 3.2.4 | Same-purpose labels are consistent across pages | Site crawl / human |
| 11.7 | 1.3.1 | Group legend is pertinent | Human |
| 11.9 | 4.1.2 | Button name is pertinent | Presence is `button-name`; pertinence is human |
| 11.10 | 3.3.1 | Input validation used pertinently | Partial `form-error-association` |
| 11.12 | 3.3.4 AA | Legal/financial/test data can be changed, cancelled, or reviewed | P4 |

### 12. Navigation (site-level)

| RGAA | WCAG | Title | Engine |
| --- | --- | --- | --- |
| 12.1 | 2.4.5 AA | At least two ways to find pages | Site-level (nav + search or sitemap) |
| 12.2 | 3.2.3 AA | Nav in the same place across the set | Multi-route runtime |
| 12.3 | 2.4.5 | Sitemap is pertinent | Human |
| 12.4 | 2.4.5 | Sitemap reached the same way everywhere | Site-level |
| 12.5 | 2.4.5 | Search reached the same way everywhere | Site-level |

### 13. Consultation

| RGAA | WCAG | Title | Engine |
| --- | --- | --- | --- |
| 13.1 | 2.2.1 A | User controls each time limit | Partial `no-auto-refresh`; session timeouts need human/runtime |
| 13.3 | 1.1.1 | Downloadable office docs have an accessible version | Human (out of HTML AST) |
| 13.4 | 1.1.1 | That version has the same information | Human |
| 13.5 | 1.1.1 | ASCII art / emoticons / cryptic syntax have an alternative | Human |
| 13.6 | 1.1.1 | That alternative is pertinent | Human |
| 13.7 | 2.3.1 A | Flashes below threshold | Human / specialized tooling |

---

## Missing WCAG 2.2 A/AA not listed above

Catalog already maps *something* to these SCs (often a slice, not the full SC): 1.1.1, 1.2.1, 1.2.2, 1.3.1, 1.3.3, 1.3.4, 1.3.5, 1.4.1, 1.4.2, 1.4.3, 1.4.4, 1.4.5, 1.4.12, 2.1.1, 2.1.4, 2.2.1, 2.2.2, 2.4.1, 2.4.2, 2.4.3, 2.4.4, 2.4.6, 2.5.1, 2.5.2, 2.5.3, 2.5.4, 2.5.8, 3.1.1, 3.1.2, 3.2.1, 3.2.2, 3.3.1, 3.3.2, 3.3.3, 3.3.4, 4.1.1, 4.1.2.

Still missing as first-class A/AA SCs:

| WCAG | Level | Closest RGAA | Planned band |
| --- | --- | --- | --- |
| 1.2.3 AD or media alternative | A | 4.1 | Human |
| 1.2.4 Captions (live) | AA | — (live media) | Human |
| 1.2.5 Audio description | AA | 4.5 | Human |
| 1.3.2 Meaningful sequence | A | 10.3 / 5.3 | Human |
| 1.4.10 Reflow | AA | 10.11 | P2 |
| 1.4.11 Non-text contrast | AA | 3.3 | P2 |
| 1.4.13 Content on hover or focus | AA | 10.13 | P2 |
| 2.1.2 No keyboard trap | A | 12.9 | P2 |
| 2.3.1 Three flashes | A | 13.7 | Human |
| 2.4.5 Multiple ways | AA | 12.1 | Site-level |
| 2.4.7 Focus visible | AA | 10.7 | P2 |
| 2.4.11 Focus not obscured | AA | (RGAA 5) | P3 |
| 2.5.7 Dragging movements | AA | 13.10 / RGAA 5 | P3 |
| 3.2.3 Consistent navigation | AA | 12.2 | Site-level |
| 3.2.4 Consistent identification | AA | 11.3 | Site-level |
| 3.2.6 Consistent help | A | (RGAA 5) | P3 |
| 3.3.4 Error prevention (legal) | AA | 11.12 | P4 |
| 3.3.7 Redundant entry | A | (RGAA 5) | P3 |
| 3.3.8 Accessible authentication | AA | (RGAA 5) | P3 |
| 4.1.3 Status messages | AA | 7.5 | P1 / P4 |

WCAG AAA (1.2.6–1.2.9, 1.3.6, 1.4.6–1.4.9, 2.1.3, 2.2.3–2.2.6, 2.3.2–2.3.3, 2.4.8–2.4.10, 2.4.12–2.4.13, 2.5.5–2.5.6, 3.1.3–3.1.6, 3.2.5, 3.3.5–3.3.6, 3.3.9) stays out of the MVP catalog.

---

## Suggested implementation order

1. ~~**P0 axe promotions**~~ — shipped.
2. ~~**P1 AST twins**~~ — shipped.
3. ~~**P4 seed**~~ — nine human pertinence controls — shipped.
4. ~~**P2 `focus-visible` + `keyboard-trap`**~~ — shipped.
5. ~~**P3 WCAG 2.2** (`focus-not-obscured`, `accessible-auth`, `dragging`)~~ — shipped.
6. **P2 remainder** (`non-text-contrast`, `reflow`, `hover-content`, …) then site-level 12.1–12.5.

---

## How to add a rule

Follow `.cursor/rules/analysis-engine.mdc`. Touch only what the engine needs:

1. `src/analysis/types.ts` — add the `CheckId`.
2. AST: `src/analysis/checks/<id>.ts` + `*.test.ts`, register in `registry.ts`. Runtime-only: skip AST, add to `RUNTIME_ONLY_CHECK_IDS` in `check-authority.ts`.
3. `src/analysis/runtime/axe-map.ts` — map every axe rule that should status this control. Do not reuse an existing check for a different WCAG SC.
4. `src/adapters/rgaa/controls.ts` — one control, **official** `code` / `secondaryCode`, `complianceWeight`. Add the id to the right presets (`presets.ts` for both RGAA and WCAG). AA criteria go in AA *and* Full; A criteria too. Do not hide Level A checks in the AAA preset (today `pointer-gesture` / `3.2.1` are mis-binned).
5. `src/adapters/rgaa/guidance.ts` — impact + how to fix, engineer voice.
6. AST: one deliberate violation in `packages/check/testdata`.
7. Human-only: `checkId: null`, no analysis code; status stays `unable_to_verify` until human pass or exception.

AI never sets the requirement status.

---

## Mapping debt

Fix these when touching the neighboring control. New rows in this doc use official numbers; the catalog currently does not.

| Catalog `checkId` | Stored as | Official criterion | Issue |
| --- | --- | --- | --- |
| `autoplay-media` | RGAA 4.1 | **4.10** (WCAG 1.4.2) | 4.1 is transcript/audio-description, not autoplay. |
| `aria-role` | 8.6 | **7.1** | 8.6 is page-title pertinence. |
| `aria-props` | 8.7 | **7.1** | 8.7 is language-of-parts presence. |
| `aria-required-attr` | 8.8 | **7.1** | Collides with `lang-parts`. |
| `no-autofocus` | 12.7 | **12.8** (or leave as 2.4.3 only) | 12.7 is the skip link (`bypass` already uses it). |
| `target-size` | 11.11 | WCAG **2.5.8** (no RGAA 4.1.2 equivalent) | 11.11 is error suggestions. |
| `pointer-gesture` | 11.6 | **13.10** | 11.6 is fieldset legend. |
| `pointer-cancellation` | 11.7 | **13.11** | 11.7 is legend pertinence. |
| `focus-context-change` | 10.9 | **7.4** (WCAG 3.2.1) | 10.9 is sensory characteristics. |
| `input-context-change` | 10.10 | **7.4** (WCAG 3.2.2) | 10.10 is pertinence of 10.9. |
| `sensory-characteristics` | 10.3 | **10.9 / 3.1** | 10.3 is “understandable with CSS off”. |
| `image-of-text` | 10.1 | **1.8** | 10.1 is “use CSS for presentation”. |
| `error-suggestion` | 11.12 | **11.11** | 11.12 is legal/financial error prevention. |
| `no-auto-refresh` | 13.2 | **13.1** | 13.2 is unsolicited new windows. |
| `content-region` | 9.2.1 | **9.2 / 12.6** | 9.2.1 is not an RGAA criterion number. |
| `label-in-name` | 11.1 | WCAG **2.5.3** (no dedicated RGAA 4.1.2) | Don't double-count as 11.1 (that's `input-label`). |

AAA presets currently include Level A SCs (`2.5.1`, `3.2.1`, `1.3.3`, …) that belong in AA/Full. Re-bin when adding the P1/P3 rows.

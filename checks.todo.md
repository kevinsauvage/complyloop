# Compliance checks gap analysis
Generated: 2026-09-01 (updated after implementation pass)
RGAA source: DISIC/accessibilite.numerique.gouv.fr `RGAA/criteres.json` @ 95d5ef3 (2026-01-07); embedded WCAG ref version 2.1; **106 criteria** in **13 thématiques**
WCAG source: W3C `new-in-22` — **9 SC added**, **4.1.1 Parsing removed** → **86 total SC** in WCAG 2.2
axe-core: **4.13.0** — **105 rules** in package, **117 mappings** in `axe-map.ts` (includes ComplyLoop custom rules)

Platform inventory: **149 controls**, **74 AST checks** in registry, **80/106 RGAA criteria** have ≥1 automated control, **26/106** RGAA criteria have only human-review controls (`checkId: null` on every mapped control for that criterion).

## P0 — axe-map wiring

_No non-AAA axe-core rules with WCAG SC tags are unmapped. axe-core version matches 4.13.0 — no version-mismatch blocker._

## P1 — WCAG 2.2 net-new criteria

Deliberate status for all 9 net-new SC (per W3C new-in-22):

- [✓] **2.4.11** (AA) Focus Not Obscured (Minimum) — covered (`focus-not-obscured` RUNTIME)
- [✓] **2.4.12** (AAA) Focus Not Obscured (Enhanced) — covered (`focus-not-obscured-enhanced` RUNTIME custom check)
- [✓] **2.4.13** (AAA) Focus Appearance — covered (`focus-appearance` RUNTIME custom check)
- [✓] **2.5.7** (AA) Dragging Movements — covered (`dragging` AST)
- [✓] **2.5.8** (AA) Target Size (Minimum) — covered (`target-size` AXE-MAP)
- [✓] **3.2.6** (A) Consistent Help — covered (`consistent-help` RUNTIME)
- [✓] **3.3.7** (A) Redundant Entry — covered (`redundant-entry` AST)
- [✓] **3.3.8** (AA) Accessible Authentication (Minimum) — covered (`accessible-auth` AST)
- [✗] **3.3.9** (AAA) Accessible Authentication (Enhanced) — uncovered — MANUAL only; no automation target

Uncovered net-new SC: **3.3.9** (AAA auth enhanced).

## P2 — AST-checkable gaps

- [✓] 1.2 / 1.1.1, 4.1.2 — Decorative images ignored by AT — AST — `decorative-ignored` (`ctl-decorative-ignored`)
- [✓] 8.7 / 3.1.2 — Foreign-language passages need `lang` — AST — `lang-change` (`ctl-lang-change-indicated`)
- [✓] 13.5 / 1.1.1 — ASCII art / cryptic text needs alt — AST — `cryptic-content-alt` (`ctl-cryptic-content-alt`, heuristic)
- [✓] — / 1.2.3 — Prerecorded video audio description or media alternative — AST — `audio-description-or-alt` (`ctl-audio-description-or-alt`, heuristic)
- [✓] — / 1.2.4 — Live synchronized media captions — AST heuristic — `captions-live` (`ctl-captions-live`); rendered live-caption verification still runtime-only

## P3 — runtime-only gaps

- [✓] 3.1 / 1.4.1 — Information not conveyed by color alone — RUNTIME — `info-not-color-only` custom check (`ctl-info-not-color-only`); `use-of-color` still covers links (10.6)
- [ ] 4.13 / 4.1.2 — Media players expose name, role, value to AT — RUNTIME — `media-controls-present` is partial; full player audit needed
- [ ] 5.3 / 1.3.2 — Layout tables linearize with CSS disabled — RUNTIME — Requires browser with stylesheets disabled
- [ ] 10.1 / 1.3.1 — Presentation via CSS not deprecated markup — RUNTIME — Needs rendered detection of presentational elements vs stylesheets
- [ ] 10.3 / 1.3.2, 2.4.3 — Content understandable with CSS disabled — RUNTIME — CSS-off browser pass
- [✓] 10.8 / 1.3.2, 4.1.2 — Visually hidden content hidden from AT — RUNTIME — axe `hidden-content` wired → `hidden-content` (`ctl-hidden-content-ignored`)
- [✓] 12.8 / 2.4.3 — Focus order matches visual reading order — RUNTIME — `focus-order-logical` custom check (`ctl-focus-order-logical`); `positive-tabindex` AST is complementary
- [~] 12.11 / 2.1.1 — Hover/focus supplementary content keyboard reachable — RUNTIME — `hover-content` custom check covers RGAA 10.13 (`ctl-hover-content`); `ctl-supplementary-content-keyboard` (12.11) stays `checkId: null` (one checkId per control catalog rule)
- [ ] 13.7 / 2.3.1 — Flashes below three-per-second threshold — RUNTIME — Frame-by-frame luminance during playback

## P4 — AAA / low-confidence

- [✓] no RGAA mapping / 1.4.6 — AAA enhanced color contrast — AXE-MAP — `color-contrast-enhanced` → `color-contrast`
- [✓] no correspondence / 2.4.9 — Same-named links same purpose — AXE-MAP — `identical-links-same-purpose` → `identical-links-purpose` (`ctl-identical-links-purpose`)
- [✓] — / 2.4.12 — Focus not fully obscured (enhanced AAA) — RUNTIME — `focus-not-obscured-enhanced`
- [✓] — / 2.4.13 — Focus indicator appearance — RUNTIME — `focus-appearance`
- [ ] — / 3.3.9 — Accessible authentication enhanced — MANUAL — `accessible-auth` covers 3.3.8 minimum only
- [ ] — / — — `aria-allowed-role` — AXE-MAP? — best-practice; intentional omission
- [ ] — / — — `aria-text` — AXE-MAP? — best-practice; intentional omission
- [ ] — / — — `aria-treeitem-name` — AXE-MAP? — best-practice; intentional omission
- [ ] — / — — `focus-order-semantics` — AXE-MAP? — experimental/review-item; intentional omission
- [ ] — / — — `frame-tested` — AXE-MAP? — review-item; intentional omission
- [ ] — / — — `image-redundant-alt` — AXE-MAP? — best-practice; intentional omission
- [ ] — / — — `landmark-complementary-is-top-level` — AXE-MAP? — deprecated; intentional omission
- [✓] — / — — `table-duplicate-name` — AXE-MAP — wired → `table-caption` (best-practice duplicate caption/summary text)

## Appendix A — axe-core rules with no mapping at all

**8 of 105** axe-core 4.13.0 rules have no entry in `axe-map.ts`:

- `aria-allowed-role` — best-practice only, no WCAG SC tag
- `aria-text` — best-practice only
- `aria-treeitem-name` — best-practice only
- `focus-order-semantics` — experimental/review-item
- `frame-tested` — review-item
- `image-redundant-alt` — best-practice only
- `landmark-complementary-is-top-level` — deprecated rule

_Wired since initial analysis:_ `color-contrast-enhanced`, `identical-links-same-purpose`, `hidden-content`, `table-duplicate-name`.

## Appendix B — RGAA criteria classified MANUAL

**22 criteria** are subjective, out-of-scope, or workflow checks — not automation targets. (Four others from the 26 manual-only criteria are listed in P3 above.)

- **1.3** — Image alt text pertinence — subjective content-quality judgment
- **1.4** — CAPTCHA alt identifies nature/function — requires human verification
- **1.5** — CAPTCHA non-image alternative present — modality choice needs human review
- **1.7** — Detailed image description pertinence — subjective
- **2.2** — Frame title pertinence — subjective
- **4.2** — Transcript/audio-description pertinence — subjective
- **4.4** — Caption pertinence — subjective
- **4.6** — Audio-description pertinence — subjective
- **4.7** — Media clearly identifiable — contextual; partial via media-controls-present
- **4.9** — Non-temporal media alt pertinence — subjective
- **5.2** — Table summary pertinence — subjective
- **5.5** — Table title pertinence — subjective
- **7.2** — Script alternative pertinence — subjective
- **10.10** — Sensory characteristics pertinence — subjective (sensory-characteristics AST is heuristic only)
- **11.2** — Form label pertinence — subjective
- **11.7** — Fieldset legend pertinence — subjective
- **11.12** — Legal/financial form error prevention — business workflow review
- **12.3** — Sitemap pertinence — subjective
- **13.4** — Office-doc equivalent content — downloadable document audit, outside page source
- **13.6** — Cryptic-content alt pertinence — subjective

## Implementation log (2026-09-01)

**Batch 1 — AST:** `decorative-ignored`, `lang-change`, `cryptic-content-alt`, `audio-description-or-alt`

**Batch 2 — AST + runtime:** `captions-live` (heuristic AST); runtime custom checks `info-not-color-only`, `focus-order-logical`, `focus-not-obscured-enhanced`, `focus-appearance`; axe wiring for `hidden-content`, `identical-links-same-purpose`; axe aliases `color-contrast-enhanced`, `table-duplicate-name`

**Gates:** `lint`, `typecheck`, `test`, `build` pass.

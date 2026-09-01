# Compliance checks gap analysis
Generated: 2026-09-01 (updated after batch 3)
RGAA source: DISIC/accessibilite.numerique.gouv.fr `RGAA/criteres.json` @ 95d5ef3 (2026-01-07); embedded WCAG ref version 2.1; **106 criteria** in **13 thématiques**
WCAG source: W3C `new-in-22` — **9 SC added**, **4.1.1 Parsing removed** → **86 total SC** in WCAG 2.2
axe-core: **4.13.0** — **105 rules** in package, **122 mappings** in `axe-map.ts` (includes ComplyLoop custom rules)

Platform inventory: **149 controls**, **74 AST checks** in registry, **85/106 RGAA criteria** have ≥1 automated control, **21/106** RGAA criteria have only human-review controls (`checkId: null` on every mapped control for that criterion).

## P0 — axe-map wiring

_No non-AAA axe-core rules with WCAG SC tags are unmapped. axe-core version matches 4.13.0 — no version-mismatch blocker._

## P1 — WCAG 2.2 net-new criteria

- [✓] **2.4.11** (AA) Focus Not Obscured (Minimum) — `focus-not-obscured` RUNTIME
- [✓] **2.4.12** (AAA) Focus Not Obscured (Enhanced) — `focus-not-obscured-enhanced` RUNTIME
- [✓] **2.4.13** (AAA) Focus Appearance — `focus-appearance` RUNTIME
- [✓] **2.5.7** (AA) Dragging Movements — `dragging` AST
- [✓] **2.5.8** (AA) Target Size (Minimum) — `target-size` AXE-MAP
- [✓] **3.2.6** (A) Consistent Help — `consistent-help` RUNTIME
- [✓] **3.3.7** (A) Redundant Entry — `redundant-entry` AST
- [✓] **3.3.8** (AA) Accessible Authentication (Minimum) — `accessible-auth` AST
- [✗] **3.3.9** (AAA) Accessible Authentication (Enhanced) — MANUAL only

Uncovered net-new SC: **3.3.9** (AAA auth enhanced).

## P2 — AST-checkable gaps

_All identified P2 gaps implemented._

- [✓] 1.2 — `decorative-ignored`
- [✓] 8.7 — `lang-change`
- [✓] 13.5 — `cryptic-content-alt` (heuristic)
- [✓] 1.2.3 — `audio-description-or-alt` (heuristic)
- [✓] 1.2.4 — `captions-live` (heuristic AST; live caption playback still needs human/runtime confirmation)

## P3 — runtime-only gaps

- [✓] 3.1 / 1.4.1 — `info-not-color-only` custom check
- [✓] 4.13 / 4.1.2 — `media-at-compatible` custom check (custom players without names/labels; native `controls` deferred to browser)
- [✓] 5.3 / 1.3.2 — `layout-table-linearization` custom check (visual vs DOM cell order on layout tables)
- [✓] 10.1 / 1.3.1 — `css-for-presentation` custom check (deprecated tags/attrs)
- [✓] 10.3 / 1.3.2, 2.4.3 — `css-off-understandable` custom check (text loss + flex/grid order when CSS disabled)
- [✓] 10.8 — `hidden-content` axe wiring
- [✓] 12.8 — `focus-order-logical` custom check
- [~] 12.11 — `hover-content` covers RGAA 10.13; `ctl-supplementary-content-keyboard` (12.11) stays `checkId: null` (catalog uniqueness)
- [✓] 13.7 / 2.3.1 — `flash-threshold` custom check (heuristic: large infinite CSS animations ≤333ms; not full luminance analysis)

_Related existing checks:_ `css-disabled-content` (RGAA 10.2), `media-keyboard` (RGAA 4.11), `layout-table-markup` (AST, RGAA 5.4).

## P4 — AAA / low-confidence

- [✓] 1.4.6 — `color-contrast-enhanced` → `color-contrast`
- [✓] 2.4.9 — `identical-links-same-purpose` → `identical-links-purpose`
- [✓] 2.4.12 / 2.4.13 — runtime focus checks (see P1)
- [ ] 3.3.9 — MANUAL
- [ ] Intentionally unmapped best-practice axe rules (7) — see Appendix A
- [✓] `table-duplicate-name` → `table-caption`

## Appendix A — axe-core rules with no mapping

**7 of 105** rules remain unmapped (all best-practice, experimental, or deprecated):

- `aria-allowed-role`, `aria-text`, `aria-treeitem-name`, `focus-order-semantics`, `frame-tested`, `image-redundant-alt`, `landmark-complementary-is-top-level`

## Appendix B — RGAA criteria classified MANUAL

**20 criteria** are subjective, out-of-scope, or workflow checks. (One fewer than prior count — automated coverage expanded.)

- **1.3**, **1.4**, **1.5**, **1.7** — image/CAPTCHA pertinence
- **2.2** — frame title pertinence
- **4.2**, **4.4**, **4.6**, **4.7**, **4.9** — media pertinence
- **5.2**, **5.5** — table summary/title pertinence
- **7.2** — script alternative pertinence
- **10.10** — sensory characteristics pertinence
- **11.2**, **11.7**, **11.12** — form/legend pertinence & legal workflow
- **12.3** — sitemap pertinence
- **13.4**, **13.6** — office docs & cryptic alt pertinence

## Implementation log

**Batch 1 — AST:** `decorative-ignored`, `lang-change`, `cryptic-content-alt`, `audio-description-or-alt`

**Batch 2 — AST + runtime:** `captions-live`; `info-not-color-only`, `focus-order-logical`, `focus-not-obscured-enhanced`, `focus-appearance`; axe wiring for `hidden-content`, `identical-links-same-purpose`, `color-contrast-enhanced`, `table-duplicate-name`

**Batch 3 — runtime:** `css-for-presentation`, `css-off-understandable`, `layout-table-linearization`, `media-at-compatible`, `flash-threshold`

**Gates:** `lint`, `typecheck`, `test`, `build` pass.

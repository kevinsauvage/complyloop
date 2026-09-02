# Compliance checks gap analysis
Generated: Wednesday, 2 September 2026
RGAA source: [DISIC `RGAA/criteres.json`](https://raw.githubusercontent.com/DISIC/accessibilite.numerique.gouv.fr/main/RGAA/criteres.json) — last commit **2026-01-07**; embeds WCAG **2.1** mapping; live site confirms **13 thématiques**, **106 critères**
WCAG source: [WCAG 2.2 quickref](https://www.w3.org/WAI/WCAG22/quickref/) + [new-in-22](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/) — fetched **2026-09-02**; **9** additions, **4.1.1 Parsing** removed → **86** SC total
axe-core: **4.13.0** installed (`package.json` ^4.13.0, lockfile resolved 4.13.0) — matches latest checked **4.13.0**

## Summary counts (this run)
- RGAA critères: **106** across **13** thématiques
- WCAG 2.2 SC in scope: **86** (excludes removed 4.1.1; platform still maps RGAA 8.1 → doctype check)
- axe-core `getRules()`: **105** rules; **122** entries in `axe-map.ts` (includes **22** custom ComplyLoop rules)
- AST checks in `registry.ts`: **78**; catalog controls: **149** (**21** human-only pertinence)
- RGAA critères with working automation: **89**; human-only pertinence: **17**
- WCAG SC with zero working automation at **AA**: **0** (3.3.4 now covered); remaining gaps are AAA or deferred

## Implement vs. don't implement

Guidance for triage. "Don't implement" here means **don't build automated checks** — keep the catalog control as human-reviewed (`checkId: null`) or `needs_review`, not "ignore the requirement."

### Should implement (next engineering work)

Prioritized for MVP (**WCAG 2.2 AA** + RGAA presence checks). Prefer cheap wins (AST / axe-map) before new runtime flows.

| Priority | Item | Why |
| -------- | ---- | --- |
| **Now** | **3.3.4** error prevention — RUNTIME | **Done** — error-prevention AST + runtime |
| **Now** | **3.3.9** accessible auth enhanced — RUNTIME | **Done** — ctl-accessible-auth-enhanced (heuristic) |
| **Soon** | **1.5** CAPTCHA non-image alternative — RUNTIME | **Done** — captcha-alternative |
| **Soon** | **12.11** supplementary hover/focus content — RUNTIME | **Done** — supplementary-content-keyboard |
| **Soon** | **2.3.3** reduced motion — AST | **Done** — reduced-motion (AAA preset) |
| **Soon** | **6.1** link explicitness — AST | **Done** — link-explicit-heuristic extended |
| **Later** | **4.7** non-temporal media identification — RUNTIME | **Done** — media-identification |
| **Later** | AAA tier **split in presets** (2.4.12, 2.4.13, 1.4.6, 2.3.3, 3.3.9) — PRESETS | **Done** — AA vs extra-checks preset boundaries updated |
| **Later** | **1.4.6** contrast 7:1 — AXE-MAP | **Done** — ctl-color-contrast-enhanced in AAA preset |

**Already implemented — don't re-build, just ensure runtime is configured:**

- Site-level checks (`multiple-ways`, `consistent-nav`, `consistent-help`, `consistent-sitemap`, `consistent-search`, `consistent-landmarks`, `duplicate-page-title`) — need `runtimeBaseUrl` + 2+ preview routes
- All 8 other WCAG 2.2 net-new SC (2.4.11, 2.5.7, 2.5.8, 3.2.6, 3.3.7, 3.3.8, …) — covered
- All axe-core rules with WCAG SC tags — mapped in `axe-map.ts` (P0 clear)

### Should not implement (keep human-reviewed or defer)

| Category | Items | Why not automate |
| -------- | ----- | ---------------- |
| **Pertinence / quality** | RGAA 1.3, 1.7, 2.2, 4.2, 4.4, 4.6, 4.9, 5.2, 5.5, 7.2, 10.10, 11.2, 11.7, 13.4, 13.6 (+ pertinence twins in `pertinence-twins.ts`) | "Is this alt/caption/legend *good*?" requires human judgment; automating would produce false passes |
| **Business-flow judgment** | RGAA 11.12 pertinence twin, 12.3 sitemap pertinence, 13.4 office-doc equivalence | Confirm/review *quality* and content equivalence aren't verifiable from DOM alone |
| **Language / literacy** | WCAG 3.1.3–3.1.6 (unusual words, abbreviations, reading level, pronunciation) | Needs NLP or subject-matter review; high false-positive rate |
| **Contextual / behavioral** | WCAG 2.4.8 location, 2.4.9 link purpose (link only), 3.2.5 change on request | Breadcrumb adequacy and "user requested this change" are contextual |
| **axe best-practice / experimental** | `aria-allowed-role`, `aria-text`, `aria-treeitem-name`, `focus-order-semantics`, `image-redundant-alt`, `frame-tested`, `landmark-complementary-is-top-level` | Not WCAG SC-mapped or tagged experimental/deprecated; wiring adds noise without AA coverage gain |
| **Heuristic-only AST checks** | 19 checks in `HEURISTIC_CHECK_IDS` (`link-explicit-heuristic`, `captions-live`, `pointer-gesture`, `error-prevention`, `reduced-motion`, …) | Already flag suspects; **must not** upgrade to auto-`passed` — keep `needs_review` path per `check-authority.ts` |
| **Low MVP value / high cost** | 1.2.6–1.2.9 (sign language, extended AD, live alternatives), 1.4.7–1.4.8, 2.2.3–2.2.6 (session timing), 2.1.3, 2.5.6, 3.3.5–3.3.6 | AAA or multi-step flow testing; defer unless a customer explicitly targets AAA or media-heavy apps |
| **Removed in WCAG 2.2** | 4.1.1 Parsing | Obsolete in 2.2; keep RGAA 8.1 doctype check for RGAA compliance but don't invest in stricter parsing validation |

**Rule of thumb:** if the RGAA test asks "is it *pertinent* / *equivalent* / *accurate*?", keep it **MANUAL**. If it asks "is it *present* / *programmatically determinable* / *operable*?", consider **AST** or **RUNTIME**.

## P0 — axe-map wiring
- [x] *(none)* — Every axe-core rule carrying a WCAG SC tag (`wcagNNN`) is mapped in `axe-map.ts`. Seven unmapped rules are `best-practice`, `experimental`, `deprecated`, or audit-infra only (Appendix A).

## P1 — WCAG 2.2 net-new criteria
- [x] WCAG 2.4.11 / 2.4.11 — Focused controls are not hidden by other content — RUNTIME — Net-new 2.2 SC — covered (ctl-focus-not-obscured)
- [x] WCAG 2.4.12 / 2.4.12 — No part of the focused control is hidden — RUNTIME — Net-new 2.2 SC — covered (ctl-focus-not-obscured-enhanced)
- [x] WCAG 2.4.13 / 2.4.13 — Focus indicator meets minimum size — RUNTIME — Net-new 2.2 SC — covered (ctl-focus-appearance)
- [x] WCAG 2.5.7 / 2.5.7 — Drag operations have a single-pointer alternative — AST — Net-new 2.2 SC — covered (ctl-dragging)
- [x] WCAG 2.5.8 / 2.5.8 — Pointer targets are large enough — AXE-MAP — Net-new 2.2 SC — covered (ctl-target-size)
- [x] WCAG 3.2.6 / 3.2.6 — Help mechanisms appear in a consistent order — RUNTIME — Net-new 2.2 SC — covered (ctl-consistent-help; site-level)
- [x] WCAG 3.3.7 / 3.3.7 — Multi-step forms do not re-ask known data — AST — Net-new 2.2 SC — covered (ctl-redundant-entry)
- [x] WCAG 3.3.8 / 3.3.8 — Authentication does not block autofill or paste — AST — Net-new 2.2 SC — covered (ctl-accessible-auth)
- [x] no RGAA correspondence found / 3.3.9 — Accessible Authentication (Enhanced) — RUNTIME — ctl-accessible-auth-enhanced + heuristic AST/runtime (puzzle CAPTCHA only)

## P2 — AST-checkable gaps
- [x] 6.1 / 2.4.4 — Link purpose is explicit out of context — AST — link-explicit-heuristic extended
- [x] 2.3.3 / 2.3.3 — Animation from interactions can be disabled — AST — reduced-motion check (AAA preset)
- [ ] 1.3.6 / 1.3.6 — Identify input purpose (AAA) — AST — Extend autocomplete-purpose beyond AA 1.3.5 tokens
- [ ] 1.4.9 / 1.4.9 — Images of text without exception — AST — image-of-text heuristic exists but AAA strictness not enforced

## P3 — runtime-only gaps
- [x] 1.5 / 1.1.1 — CAPTCHA has a non-image alternative modality — RUNTIME — captcha-alternative check
- [x] 4.7 / 1.1.1 — Non-temporal media clearly identified with alternatives — RUNTIME — media-identification check
- [x] 12.11 / 2.1.1 — Supplementary hover/focus content keyboard reachable — RUNTIME — supplementary-content-keyboard (title tooltips + hidden aria-controls panels)
- [x] 3.3.4 / 3.3.4 — Legal/financial/test submissions are reversible or confirmed — RUNTIME — error-prevention check (only uncovered AA SC now covered)
- [ ] 2.2.3 / 2.2.3 — Timing is not essential (no session limits) — RUNTIME — No session-timeout or essential-timing detection
- [ ] 2.2.4 / 2.2.4 — Interruptions can be postponed or suppressed — RUNTIME — No interruptible update/alert detection
- [ ] 2.2.5 / 2.2.5 — Re-authenticating preserves user data — RUNTIME — Auth-timeout data-loss needs multi-step flow testing
- [ ] 2.2.6 / 2.2.6 — Users are warned of timeouts — RUNTIME — No timeout-warning detection
- [ ] 2.4.10 / 2.4.10 — Section headings organize content — RUNTIME — No check that content sections expose headings
- [ ] 3.3.5 / 3.3.5 — Context-sensitive help is available — RUNTIME — No help-text proximity detection for complex fields
- [ ] 3.3.6 / 3.3.6 — Error prevention for all user submissions — RUNTIME — No review/confirm step detection for general forms
- [ ] 1.2.6 / 1.2.6 — Sign-language interpretation on pre-recorded video — RUNTIME — No sign-language media track inspection
- [ ] 1.2.7 / 1.2.7 — Extended audio description on pre-recorded video — RUNTIME — No extended-AD track inspection
- [ ] 1.2.8 / 1.2.8 — Media alternative for pre-recorded synchronized media — RUNTIME — No full media-alternative check
- [ ] 1.2.9 / 1.2.9 — Live audio-only alternative — RUNTIME — No live-media alternative check
- [ ] 2.5.6 / 2.5.6 — Concurrent input mechanisms not restricted — RUNTIME — No touch/mouse/keyboard restriction detection

## P4 — AAA / low-confidence
- [x] — / 3.3.9 — Accessible Authentication (Enhanced) — RUNTIME — ctl-accessible-auth-enhanced (heuristic; puzzle CAPTCHA near auth)
- [x] — / 2.4.12 — Focus Not Obscured (Enhanced) — RUNTIME — AAA preset only (removed from AA preset)
- [x] — / 2.4.13 — Focus Appearance — RUNTIME — AAA preset only (removed from AA preset)
- [x] — / 1.4.6 — Contrast (Enhanced) 7:1 — AXE-MAP — color-contrast-enhanced split to ctl-color-contrast-enhanced (AAA preset)
- [ ] — / 1.4.7 — Low or no background audio — RUNTIME — No background-audio measurement
- [ ] — / 1.4.8 — Visual presentation — RUNTIME — No block-width/justification/line-spacing override check
- [ ] — / 2.1.3 — Keyboard (no exception) — RUNTIME — No AAA keyboard stricter than 2.1.1
- [ ] — / 2.3.2 — Three Flashes — RUNTIME — flash-threshold targets 2.3.1; 2.3.2 AAA threshold not separate
- [ ] — / 2.4.8 — Location — MANUAL — Breadcrumb/current-page indication is contextual
- [ ] — / 2.4.9 — Link Purpose (Link Only) — MANUAL — identical-links-purpose is partial; AAA link-only context not automated
- [ ] — / 2.5.5 — Target Size (Enhanced) 44×44 — RUNTIME — target-size covers 2.5.8 AA minimum only
- [ ] — / 3.1.3 — Unusual Words — MANUAL — Definitions/glossary links need language understanding
- [ ] — / 3.1.4 — Abbreviations — MANUAL — Expansion not machine-verifiable
- [ ] — / 3.1.5 — Reading Level — MANUAL — Reading level requires NLP or human review
- [ ] — / 3.1.6 — Pronunciation — MANUAL — Pronunciation metadata not automatable
- [ ] — / 3.2.5 — Change on Request — MANUAL — Context changes on user request — behavioral
- [ ] focus-order-semantics / — — axe focus-order-semantics rule — AXE-MAP — Tagged experimental+best-practice; maps to RGAA 12.8 — evaluate before wiring
- [ ] image-redundant-alt / — — axe image-redundant-alt rule — AXE-MAP — Best-practice only; may duplicate alt+text redundancy checks
- [ ] heuristic checks / — — 19 AST heuristics (link-explicit, captions-live, error-prevention, reduced-motion, …) flag suspects but cannot set `passed` without human review per `check-authority.ts` — MANUAL — Document as partial or add pertinence twins

## Appendix A — axe-core rules with no mapping at all
- `aria-allowed-role` — tags: cat.aria, best-practice — Likely intentional (best-practice)
- `aria-text` — tags: cat.aria, best-practice — Likely intentional (best-practice)
- `aria-treeitem-name` — tags: cat.aria, best-practice — Likely intentional (best-practice)
- `focus-order-semantics` — tags: cat.keyboard, best-practice, RGAAv4, RGAA-12.8.1, experimental — Likely intentional (best-practice, experimental)
- `frame-tested` — tags: cat.structure, best-practice, review-item — Likely intentional (best-practice, review-item)
- `image-redundant-alt` — tags: cat.text-alternatives, best-practice — Likely intentional (best-practice)
- `landmark-complementary-is-top-level` — tags: cat.semantics, best-practice, deprecated — Likely intentional (best-practice, deprecated)

## Appendix B — RGAA criteria classified MANUAL (pertinence / quality)

Presence checks now cover RGAA **1.5**, **4.7**, **11.12**, and **12.11** via automated controls; the items below are **pertinence or equivalence** reviews only (`checkId: null`).

- 1.3 / 1.1.1, 4.1.2 — Image text alternatives are pertinent — Subjective pertinence, equivalence, or business-flow judgment; catalog control has `checkId: null`
- 1.4 / 1.1.1 — CAPTCHA alternatives identify their function — Subjective pertinence, equivalence, or business-flow judgment; catalog control has `checkId: null`
- 1.7 / 1.1.1 — Detailed image descriptions are pertinent — Subjective pertinence, equivalence, or business-flow judgment; catalog control has `checkId: null`
- 2.2 / 4.1.2 — Frame titles are pertinent — Subjective pertinence, equivalence, or business-flow judgment; catalog control has `checkId: null`
- 4.2 / 1.2.1, 1.2.3 — Transcripts and audio descriptions are pertinent — Subjective pertinence, equivalence, or business-flow judgment; catalog control has `checkId: null`
- 4.4 / 1.2.2 — Captions are pertinent — Subjective pertinence, equivalence, or business-flow judgment; catalog control has `checkId: null`
- 4.6 / 1.2.5 — Audio description is pertinent — Subjective pertinence, equivalence, or business-flow judgment; catalog control has `checkId: null`
- 4.9 / 1.1.1 — Non-temporal media alternatives are pertinent — Subjective pertinence, equivalence, or business-flow judgment; catalog control has `checkId: null`
- 5.2 / 1.3.1 — Table summaries are pertinent — Subjective pertinence, equivalence, or business-flow judgment; catalog control has `checkId: null`
- 5.5 / 1.3.1 — Table titles are pertinent — Subjective pertinence, equivalence, or business-flow judgment; catalog control has `checkId: null`
- 7.2 / 1.1.1, 4.1.2 — Script alternatives are pertinent — Subjective pertinence, equivalence, or business-flow judgment; catalog control has `checkId: null`
- 10.10 / 1.3.3, 1.4.1 — Sensory instructions are implemented pertinently — Subjective pertinence, equivalence, or business-flow judgment; catalog control has `checkId: null`
- 11.2 / 2.4.6, 2.5.3, 3.3.2 — Form labels are pertinent — Subjective pertinence, equivalence, or business-flow judgment; catalog control has `checkId: null`
- 11.7 / 1.3.1, 3.3.2 — Fieldset legends are pertinent — Subjective pertinence, equivalence, or business-flow judgment; catalog control has `checkId: null`
- 12.3 / 2.4.5 — Sitemap entries are pertinent — Subjective pertinence, equivalence, or business-flow judgment; catalog control has `checkId: null`
- 13.4 / 1.1.1, 1.3.1, 1.3.2, 2.4.1, 2.4.3, 3.1.1, 4.1.2 — Accessible office alternatives are equivalent — Subjective pertinence, equivalence, or business-flow judgment; catalog control has `checkId: null`
- 13.6 / 1.1.1 — Cryptic-content alternatives are pertinent — Subjective pertinence, equivalence, or business-flow judgment; catalog control has `checkId: null`

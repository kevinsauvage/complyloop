# Accessibility analysis strategy

How we decide **what to analyze**, **which layer owns it**, and **what not to expand**.

Engine implementations live in [`docs/ai/architecture.md`](./ai/architecture.md). This doc is the decision record.

## Goal

Cover each relevant RGAA/WCAG requirement with **independent evidence**, then map it through the product loop:

**requirement → finding → remediation → verification → evidence**

Analyzers produce observations (AST, DOM, axe, interaction, site). The compliance domain correlates them into **one finding**. Do not open five tickets for one missing label.

Objective is **maximum independent evidence with minimal duplication** — not more scanners or more rules.

## Principles

1. **Axe-clean is not compliant.** Automation is incomplete. Statuses come from deterministic checks or human review, never from AI.
2. **Each layer has a job.** AST is cheap source evidence. Do not make it understand CSS, focus, or generated DOM. Do not re-implement jsx-a11y or axe as custom checks.
3. **Conditions are not checks.** Dark mode, forced colors, zoom, and 320px viewport change the environment. A check then asks whether information or control state is lost. Do not combinatorially run every check on every viewport × theme × state.
4. **Never collapse unknowns.** Untested ≠ passed. Incomplete ≠ failed. No matching control ≠ silent advisory finding.
5. **AI interprets evidence; it does not manufacture it.**

## What we have

| Layer | Tool | Job |
| --- | --- | --- |
| Source | Custom AST checks + `eslint-plugin-jsx-a11y` | Suspicious JSX; React patterns from the plugin |
| Rendered a11y | `axe-core` | Baseline accessibility tree |
| HTML structure | `html-validate` (runtime only) | Generated markup validity — RGAA 8.2 / 10.1 only |
| Browser / interaction | Playwright custom checks | Focus, reflow, widgets, media, reduced motion, forced colors |
| Theme / contrast conditions | `browserConditions` scan pass | Re-run theme-sensitive axe + custom checks under dark, light, `prefers-contrast: more`; assessments pass `DEFAULT_THEME_CONDITIONS` (`dark` + `light`) when runtime is configured |
| Site | `runtime/site-level/` | Cross-route nav, titles, help consistency |
| Site | `runtime/site-level/link-check.ts` (linkinator) | Same-origin broken links and fragment targets |

`complyloop-check` is AST-only (no browser). Runtime needs a preview URL.

**Shipped custom checks that should not be rebuilt:** focus visibility (focused vs unfocused), reflow at 320×568 with 2D-layout exceptions, dialog/tabs/disclosure/menu/form-error behaviour, forced colors, reduced motion. Target size is axe `target-size`.

## What not to add as a core engine

| Approach | Why |
| --- | --- |
| Lighthouse, Pa11y, WAVE, Tenon, `jest-axe` | Same class as axe |
| IBM Equal Access / Alfa | Same class as axe; overlapping evidence, heavy install |
| `@axe-core/playwright` | Bundling issue; we inject local `axe.min.js` |
| Generic AI vision scanner | Not deterministic or defensible |
| CSS/HTML style linters | Noise vs compliance |
| Screenshot every route / every viewport × theme | Cost, noise, combinatorial explosion |
| html-validate rules outside 8.2 / 10.1 | Lint or already owned by axe/AST |

html-validate is **document structure evidence**, not a second accessibility engine. Style rules, ARIA, labels, and headings stay out.

## What to prioritize

The layers in **What we have** are the intended architecture. This is not a scanner backlog.

1. **Preview URL adoption** — assessments without `runtimeBaseUrl` leave runtime-only check ids at `unable_to_verify`. That is a product/onboarding gap, not a missing-engine problem. Wire preview URLs before proposing another scanner.
2. **One engine per responsibility** — axe is the only rendered-accessibility scanner; html-validate covers RGAA 8.2 / 10.1 structural evidence only; Playwright custom probes own behaviour axe cannot see. Do not add a sibling a11y engine to “fill gaps”.
3. **Human verification** — 25 catalog controls stay manual (`checkId: null`). Required stage, not automation backlog.

Parked ideas (visual regression, Nu HTML Checker, a11y-tree before/after, extra keyboard frameworks, Lighthouse, Pa11y, `@html-validate/wcag`) belong in **What not to add as a core engine** above and in [`TODO.md`](../TODO.md) (**What NOT to do**). Do not treat them as ordered next work.

**Known tension with principle 4 ("never collapse unknowns"):** `video-caption`, `audio-caption`, and `media-controls-present` are classified `standard`, so a source tree with no `<video>`/`<audio>` literal passes them even though client-rendered media is invisible to AST. Runtime applicability probes fix this only when a preview URL is configured. See `TODO.md`.

## How a new check earns a place

Ask, in order:

1. Does a **relevant requirement** lack an independent verification path?
2. Does an **existing layer** already own this observation? If yes, map and dedupe — do not add a sibling scanner.
3. Can we produce **defensible evidence** (selector, before/after, condition) a developer can act on?
4. Is confidence high enough to **fail** a requirement, or should it be **needs review**?

Prefer: high-confidence + high-impact + cheap → good evidence but medium confidence (review) → skip low-trust heuristics even if the theory is sound.

**Applicability:** “no video on this page” is **not applicable**, not a failure. Runtime probes emit deterministic absence observations (`runtime/applicability.ts`); when every audited page confirms absence, status becomes `not_applicable` with the fact recorded in evidence.

**Evidence preference:** browser observation > source > document validation > behavioural test > screenshot regression > correlated multi-analyzer > human > AI interpretation.

**Site-level differentiator:** many similar findings across routes should collapse to one shared-component root cause (one Button, one fix), while keeping per-occurrence evidence.

## Coverage

Good coverage is not “500 checks”. It is:

- every relevant requirement has at least one verification path
- those paths come from **different** evidence layers
- automated findings survive human review
- a developer can fix from the finding
- a re-audit can prove the fix
- an agency can explain what was checked, when, and with what result

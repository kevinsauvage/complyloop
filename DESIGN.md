---
name: ComplyLoop
description: Requirement → Fix → Verified → Evidence. Compliance engineering for RGAA/WCAG, set like an engineer's ledger.
colors:
  ledger-ember: "oklch(0.47 0.15 42)"
  ledger-ember-dark: "oklch(0.75 0.15 55)"
  ember-foreground: "oklch(0.99 0.01 40)"
  ember-foreground-dark: "oklch(0.18 0.02 45)"
  ember-bright: "oklch(0.65 0.19 41)"
  blueprint-blue: "oklch(0.55 0.17 260)"
  blueprint-blue-dark: "oklch(0.71 0.14 260)"
  blueprint-ink: "oklch(0.28 0.04 260)"
  blueprint-ink-dark: "oklch(0.96 0.01 220)"
  drafting-paper: "oklch(0.984 0.003 248)"
  drafting-paper-dark: "oklch(0.16 0.02 240)"
  sheet: "oklch(1 0 0)"
  sheet-dark: "oklch(0.2 0.022 240)"
  pencil: "oklch(0.45 0.043 257)"
  pencil-dark: "oklch(0.74 0.02 230)"
  wash: "oklch(0.94 0.012 258)"
  wash-dark: "oklch(0.26 0.025 240)"
  hairline: "oklch(0.928 0.013 256)"
  hairline-dark: "oklch(1 0 0 / 12%)"
  status-passed: "oklch(0.42 0.13 155)"
  status-passed-dark: "oklch(0.8 0.16 155)"
  status-failed: "oklch(0.45 0.2 25)"
  status-failed-dark: "oklch(0.78 0.18 25)"
  status-review: "oklch(0.44 0.12 75)"
  status-review-dark: "oklch(0.86 0.14 85)"
  status-na: "oklch(0.46 0.02 240)"
  status-na-dark: "oklch(0.76 0.03 240)"
  status-unverifiable: "oklch(0.46 0.1 280)"
  status-unverifiable-dark: "oklch(0.8 0.12 285)"
  destructive: "oklch(0.55 0.22 25)"
  destructive-dark: "oklch(0.74 0.17 22)"
typography:
  display:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "-0.011em"
  body:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
    letterSpacing: "-0.011em"
  label:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
    letterSpacing: "-0.011em"
  control-sm:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.011em"
  data:
    fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
    fontFeature: '"tnum" 1'
  metric:
    fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.33
    letterSpacing: "-0.025em"
    fontFeature: '"tnum" 1'
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  2xl: "18px"
  pill: "26px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "32px"
components:
  button-outline:
    backgroundColor: "{colors.drafting-paper}"
    textColor: "{colors.blueprint-ink}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "36px"
    typography: "{typography.label}"
  button-outline-sm:
    backgroundColor: "{colors.drafting-paper}"
    textColor: "{colors.blueprint-ink}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "32px"
  button-primary:
    backgroundColor: "{colors.blueprint-blue}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "36px"
  button-ghost:
    textColor: "{colors.blueprint-ink}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "36px"
  badge-status:
    rounded: "{rounded.pill}"
    padding: "2px 8px"
    height: "20px"
    typography: "{typography.label}"
  input:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.blueprint-ink}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    height: "32px"
  panel:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.xl}"
    padding: "20px"
  nav-tab-active:
    textColor: "{colors.blueprint-ink}"
    height: "44px"
    padding: "0 12px"
  nav-tab:
    textColor: "{colors.pencil}"
    height: "44px"
    padding: "0 12px"
---

# Design System: ComplyLoop

## Overview

**Creative North Star: "The Engineer's Ledger"**

ComplyLoop is a record that engineers can trust. Every screen reads like a page of a well-kept ledger: ruled with hairlines, set in one sober sans, with codes, paths and numbers in monospace where precision matters. Nothing is decorative because everything on the page is accountable; a mark exists because a check, a decision, or a piece of evidence put it there. The mood is **precise, calm, and trustworthy**: calm enough to triage forty findings in a row, exact enough that a lead can forward the screen to a client.

Colour is scarce on purpose. Blueprint Ink on Drafting Paper carries the page; the status hues speak only for statuses; and a single warm accent, Ledger Ember, marks where attention should go next: the current tab, the active section, the thing that needs you. Depth comes from hairline rules and tonal surfaces on a faint graph-paper ground, not from shadows. Light and dark are equal citizens; the dark theme is a night shift on the same ledger, not a different product.

This system rejects four neighbours by name: the **GRC / enterprise dashboard** (gauges, donuts, traffic-light walls), **glossy SaaS marketing** (gradients, glass, hero metrics, decorative illustration), **raw scanner output** (walls of red without hierarchy or a next step), and **playful consumer UI** (mascots, emoji, bouncy motion, pastel saturation).

**Key Characteristics:**

- Hairline-ruled panels over a 48px graph-paper ground; flat at rest.
- One warm accent (Ledger Ember) against cool navy-slate neutrals.
- A dedicated, single-source status palette in OKLCH, tuned per theme.
- Plus Jakarta Sans throughout; monospace only for data.
- Facts presented as labelled ledger strips, not loose pills or charts.
- Light and dark themes with equal care.

## Colors

Cool, navy-tinted neutrals do the work; one ember accent and five status hues carry all meaning. Values are canonical OKLCH, each with a light and a dark (`-dark`) form.

### Primary

- **Ledger Ember** (`ledger-ember` / `ledger-ember-dark`): the attention mark. Active tab underline and active rail bar, current-section text, project and finding icons, text selection tint, the skip link, the loading bar. Brighter and warmer in dark mode so it keeps its pull on navy.
- **Ember Bright** (`ember-bright`): the louder sibling for the rare accent fill; use sparingly.

### Secondary

- **Blueprint Blue** (`blueprint-blue` / `blueprint-blue-dark`): the focus ring and the filled default button. It is the system's mechanical colour (focus, filled controls, links), never its voice; filled blue buttons are rare by design.

### Tertiary: status

- **Passed Green** (`status-passed`): requirements and checks that passed; verified remediations.
- **Failed Red** (`status-failed`): failed requirements, serious and critical severity, regressions.
- **Review Amber** (`status-review`): needs review, moderate severity, pending human decisions.
- **Not-Applicable Slate** (`status-na`): not applicable, exceptions, neutral states.
- **Unverifiable Violet** (`status-unverifiable`): unable to verify; things automation could not settle.
- **Destructive Red** (`destructive`): destructive actions (delete, disconnect), never statuses.

### Neutral

- **Blueprint Ink** (`blueprint-ink`): primary text and headings.
- **Drafting Paper** (`drafting-paper`): the page ground, beneath the graph grid.
- **Sheet** (`sheet`): panels, cards, popovers; sits a step above Drafting Paper (white in light, navy-slate in dark).
- **Pencil** (`pencil`): secondary text, labels, descriptions, inactive tabs. Holds ≥4.5:1 on Sheet in both themes.
- **Wash** (`wash`): muted fills, code blocks, hover grounds, loading skeletons.
- **Hairline** (`hairline`): every border and divider; translucent white (12%) in dark mode.

### Named Rules

**The One Ember Rule.** Ledger Ember marks where attention goes: the current location and the thing that needs action. It never fills large areas, never decorates, and never means "success" or "error".

**The Status Is Sacred Rule.** A status hue means its status and nothing else. Every status colour comes from the one tone table (`src/core/display/report-tones.ts`); no screen keeps a parallel colour map.

## Typography

**Display Font:** Plus Jakarta Sans (with ui-sans-serif, system-ui)
**Body Font:** Plus Jakarta Sans (same family)
**Label/Mono Font:** the platform monospace (ui-monospace, SF Mono, Menlo, Consolas)

**Character:** one geometric-humanist sans, slightly tightened (-0.011em body, -0.025em headings), for a calm, engineered page; monospace enters only when the content is data.

### Hierarchy

- **Display** (600, 1.5rem → 1.875rem from sm, 1.2): page titles in headers (`h1`). Balanced wrapping.
- **Headline** (600, 1rem, 1.5): section headings (`h2`) inside a page.
- **Title** (500, 1rem): card and panel titles (`h3`).
- **Body** (400, 0.875rem, 1.43): all running text; descriptions capped at 65ch.
- **Label** (500, 0.75rem): field labels, fact labels, captions, badge text; in Pencil. Always sentence case: never uppercase or letter-spaced.
- **Control (small)** (500, 0.8rem): the label inside 32px (`sm`) buttons only.
- **Data** (mono 400, 0.875rem, tabular numerals): criterion codes (RGAA 1.1 · WCAG 1.1.1), check IDs, file paths and lines, selectors, snippets.
- **Metric** (mono 600, 1.5rem, tabular numerals): headline numbers in stat strips (pass rate, open findings).

### Named Rules

**The Mono Means Data Rule.** Monospace is for codes, paths, selectors, IDs and numbers a user might copy or compare. Never as a "technical" costume for prose or labels.

## Layout

App pages sit in a shell: a left sidebar (workspace, org navigation, theme, account) and a main column. Inside a project, a breadcrumb row and an underline tab bar (Dashboard, Requirements, Findings, Evidence, Settings) lead every page. Pages then stack a header panel and content sections separated by 32px (`3xl`), with 16–24px inside panels (`lg` → `2xl`, 20px default panel padding, 24px from sm).

Spacing follows a 4px base. Tight groups (label to value, title to references) use 4–8px; related blocks inside a panel 12–20px; sections 32px. List-plus-filter pages use a two-column grid from `lg` (a sticky 13–14rem filter aside plus a fluid list); detail pages are single-column.

Responsive behaviour is structural: fact strips go 2 → 3 → 6 columns (sm 640px, xl 1280px); filter asides stack above lists below `lg` (1024px); the project tab bar scrolls horizontally on phones; keyboard-only affordances (j/k triage toggle) hide below `sm`. The graph-paper ground appears only from `lg`.

### Named Rules

**The Ledger Strip Rule.** Key facts about the thing on screen (pass rate, open findings, severity, status, remediation, confidence, check) sit on one hairline-divided strip of labelled cells at the bottom of the header panel, not as a row of loose pills. Label above value, Pencil above Ink.

**The Graph Paper Rule.** The 48px grid lives only on the page ground, at whisper strength (16% light, 4.5% dark), and only from `lg`. It never appears inside panels.

## Elevation & Depth

Flat at rest. Depth comes from tonal layering (Drafting Paper → Sheet) and 1px hairlines: panels use a 70%-strength Hairline border on a 96% Sheet fill; cards use a faint inset ring (foreground at 8%) plus a soft top sheen (a 7% foreground gradient over the top 40%). Shadows are effectively absent; the only lifted element is the focused skip link. Frosted blur is reserved for the sticky shell header, where it keeps content legible beneath it.

### Shadow Vocabulary

- **Overlay lift** (the shadcn `shadow-md` / `shadow-lg` on dropdown menus and sheets): open overlays only; this is the "raised as a state" case. Modal scrims may blur the page behind them (`backdrop-blur-xs`).
- **Focus lift** (`box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`): only the skip link when focused.

### Named Rules

**The Hairline, Not Shadow Rule.** Separate with a 1px Hairline or a tonal step, never with a drop shadow. If something must feel raised, it is a state (focus, open popover), not decoration.

## Shapes

Gently rounded, never soft. The base radius is 10px (`lg`) for buttons and inputs, 8px (`md`) for small buttons, 14px (`xl`) for panels and cards, and a full pill (`pill`) for status badges. Inside a strip or ledger, cells are square; the panel's outer radius clips them. Focus rings follow the element's own radius at 2px with a 2px offset.

## Components

### Buttons

Quiet and exact: outline-first, with colour reserved for status and signal.

- **Shape:** gently rounded (10px; 8px at `sm`, 32px tall).
- **Outline (default choice):** Drafting Paper fill, Hairline border, Ink label, 36px tall (32px `sm`); hover to Wash. Copy actions (Copy for AI, Copy summary, Copy link) are outline buttons with a leading 14–16px icon; icon-only variants are 32px (28px in dense rows) and keep a full accessible name.
- **Primary (filled):** Blueprint Blue with white label, for the one committing action of a form (Run assessment). Rare.
- **Ghost:** no border, Ink label, Wash on hover; back links and secondary navigation.
- **Destructive:** Destructive red text on a 10% tint; never a solid red slab.
- **Focus:** 3px Blueprint Blue ring at 50%, border shifts to ring colour; pressed state nudges 1px down.

### Chips (status badges)

- **Style:** 20px pill, 0.75rem medium label, tone colour on a translucent tone fill from the tone table; outline variant for severities like Serious, so a fill and an outline never look the same.
- **State:** every badge carries a plain-language description (native title plus screen-reader text).

### Cards / Containers

- **Corner Style:** 14px.
- **Background:** Sheet (96%) on Drafting Paper.
- **Shadow Strategy:** none; see Elevation & Depth.
- **Border:** 1px Hairline at 70% (panels) or an 8% foreground ring (cards).
- **Internal Padding:** 20px, 24px from sm; cards 16px (12px small).

### Inputs / Fields

- **Style:** 32px tall, 10px radius, 1px Input hairline, transparent fill (Input at 30% in dark).
- **Focus:** border turns Blueprint Blue with a 3px 50% ring.
- **Error / Disabled:** Destructive border with a 20% ring; disabled at 50% opacity on an Input wash.

### Navigation

- **Sidebar rail:** Ink labels with 16px icons; the active item gets an Ember tint fill, Ember text, and a 2px Ember bar on its left edge.
- **Project tabs:** 44px underline tabs; inactive in Pencil with a Hairline underline on hover, active in Ink with a 2px Ember underline. Scrolls horizontally on phones.
- **Queue bar (finding detail):** chromeless row: ghost back link, a hairline divider, then queue position and Previous/Next.

### The Ledger Strip (signature component)

Implemented once as `LedgerStrip` + `LedgerFact` (`src/components/primitives/page-primitives.tsx`); never hand-roll the hairline grid. A `<dl>` of labelled facts, closing a header panel (default top rule) or standing alone (`framed`): each cell has a Label (Pencil, 0.75rem) above a value (badge, Body text, Data, or Metric). Cells draw their own right and bottom hairlines and the panel clips the outer edges, so rules stay correct at 2, 3, 4 or 6 columns. Used by the dashboard header (metrics), the finding header (severity, status, remediation, detected by, confidence, check), the projects overview totals, Settings project details, and the Org account facts.

## Do's and Don'ts

### Do:

- **Do** keep Ledger Ember for location and attention only: active tab, active rail item, the next action.
- **Do** take every status colour from the one tone table, in both themes.
- **Do** set codes, file paths, selectors, IDs and metrics in monospace with tabular numerals.
- **Do** present an object's key facts as a Ledger Strip of labelled cells.
- **Do** separate surfaces with 1px hairlines and tonal steps (Drafting Paper → Sheet → Wash).
- **Do** design and check light and dark themes together; Pencil text must hold 4.5:1 on Sheet in both.
- **Do** cap descriptive text at 65ch.

### Don't:

- **Don't** build GRC / enterprise dashboard chrome: no gauges, donut charts, or traffic-light walls.
- **Don't** use glossy SaaS marketing devices in the app: no gradients, decorative glass, hero metrics, or illustrations.
- **Don't** dump raw scanner output: never a wall of red without hierarchy, location, and a next step.
- **Don't** go playful: no mascots, emoji as icons, bouncy motion, or pastel saturation.
- **Don't** use drop shadows for depth; the only lift is a focused skip link.
- **Don't** reuse a status hue for decoration, or Ledger Ember for success or error.
- **Don't** put an eyebrow or kicker label above a page heading; references, chips and context go below the title.
- **Don't** nest bordered boxes inside a panel; use a Ledger Strip or hairline dividers (`divide-y`) instead.
- **Don't** paint a focus ring on programmatic focus targets (page `h1`s and regions with `tabindex="-1"`); interactive controls always keep theirs.

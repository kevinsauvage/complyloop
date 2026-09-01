# RGAA 4.1.2 / WCAG 2.2 coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Full RGAA assess all 106 RGAA 4.1.2 criteria under the correct codes, then add the highest-value deterministic checks so A/AA holes are evidence-bearing instead of silent.

**Architecture:** Shared catalog in `src/adapters/rgaa/controls.ts` (WCAG reuses it). AST checks in `src/analysis/checks/` register in `registry.ts`. Runtime axe mapping in `axe-map.ts`; Playwright extras in `custom-checks/`; multi-route in `site-level/`. One `CheckId` maps to exactly one control (`registry.test.ts`). Status authority stays in `check-authority.ts` — AI never sets status.

**Tech Stack:** TypeScript, Vitest, existing JSX AST helpers in `src/analysis/parse.ts` / `heuristic-utils.ts`, Playwright + axe-core 4.13, guidance in `src/adapters/rgaa/guidance.ts`.

## Global Constraints

- Do not change persisted framework ids (`fw-rgaa-4`, `fw-wcag-2-1`) — display names and preset titles only.
- One `checkId` per control; never assign the same `CheckId` to two controls.
- New AST checks: colocated `*.test.ts`, violation + clean cases, register in `registry.ts`, add `CheckId` union member, guidance `Record<CheckId, …>` entry, control with `code` + `secondaryCode`, authority class if runtime-only.
- Heuristic checks emit `warning` / `medium|low` confidence — not `high` violations that over-claim pertinence.
- AI never sets requirement status. Empty runtime-only scans stay `unable_to_verify`.
- Keep `npx complyloop-check` AST-only.
- Definition of done per task: `npx vitest run` on touched tests; after each wave `npm run lint && npm run typecheck && npm run test`.
- Follow `docs/missing-rules.md` as the coverage source of truth; update tags there when a criterion moves from MISS/MAP/PART.

---

## File structure

| File | Role |
| --- | --- |
| `src/adapters/rgaa/controls.ts` | Unique control catalog (RGAA + WCAG codes) |
| `src/adapters/rgaa/presets.ts` | Full / AA / extra-heuristic targets |
| `src/adapters/wcag/controls.ts` | Framework metadata (keep id `fw-wcag-2-1`) |
| `src/adapters/wcag/presets.ts` | WCAG presets (same control ids) |
| `src/adapters/rgaa/catalog-coverage.test.ts` | Regression: 106 RGAA codes present, unique preset ids |
| `src/analysis/types.ts` | `CheckId` union |
| `src/analysis/checks/registry.ts` | AST check list |
| `src/analysis/check-authority.ts` | runtime-only / composition / site-level / (later) heuristic-unable |
| `src/analysis/runtime/axe-map.ts` | axe rule → `CheckId` |
| `src/analysis/runtime/site-level/{types,snapshot,checks}.ts` | Multi-route |
| `src/adapters/rgaa/guidance.ts` | Developer impact / how-to-fix |
| `packages/check/testdata/Coverage.tsx` | Deliberate CI-gate fixtures |
| `docs/ai/architecture.md` | Check counts after each wave |
| `docs/missing-rules.md` | Coverage tags |

---

### Task 1: Catalog coverage regression test

**Files:**
- Create: `src/adapters/rgaa/catalog-coverage.test.ts`
- Modify: none until Task 2 (this test starts red)

**Interfaces:**
- Consumes: `rgaaControls` from `src/adapters/rgaa/controls.ts`; `rgaaPresets` / `wcagPresets`
- Produces: `RGAA_412_CRITERIA` list used by later catalog tasks

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { rgaaControls } from "./controls";
import { rgaaPresets } from "./presets";
import { wcagPresets } from "@/adapters/wcag/presets";

/** Every RGAA 4.1.2 criterion id, in thematic order. */
export const RGAA_412_CRITERIA: readonly string[] = [
  "1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8", "1.9",
  "2.1", "2.2",
  "3.1", "3.2", "3.3",
  "4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "4.9", "4.10",
  "4.11", "4.12", "4.13",
  "5.1", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "5.8",
  "6.1", "6.2",
  "7.1", "7.2", "7.3", "7.4", "7.5",
  "8.1", "8.2", "8.3", "8.4", "8.5", "8.6", "8.7", "8.8", "8.9", "8.10",
  "9.1", "9.2", "9.3", "9.4",
  "10.1", "10.2", "10.3", "10.4", "10.5", "10.6", "10.7", "10.8", "10.9",
  "10.10", "10.11", "10.12", "10.13", "10.14",
  "11.1", "11.2", "11.3", "11.4", "11.5", "11.6", "11.7", "11.8", "11.9",
  "11.10", "11.11", "11.12", "11.13",
  "12.1", "12.2", "12.3", "12.4", "12.5", "12.6", "12.7", "12.8", "12.9",
  "12.10", "12.11",
  "13.1", "13.2", "13.3", "13.4", "13.5", "13.6", "13.7", "13.8", "13.9",
  "13.10", "13.11", "13.12",
];

function rgaaCodes(): Set<string> {
  const codes = new Set<string>();
  for (const control of rgaaControls) {
    const match = /^RGAA (\d+\.\d+)$/.exec(control.code);
    if (match?.[1]) codes.add(match[1]);
  }
  return codes;
}

describe("RGAA 4.1.2 catalog coverage", () => {
  it("lists all 106 criteria", () => {
    expect(RGAA_412_CRITERIA).toHaveLength(106);
    expect(new Set(RGAA_412_CRITERIA).size).toBe(106);
  });

  it("has at least one control whose code is RGAA <criterion>", () => {
    const codes = rgaaCodes();
    const missing = RGAA_412_CRITERIA.filter((id) => !codes.has(id));
    expect(missing).toEqual([]);
  });

  it("does not use invalid dotted codes such as 13.9.1", () => {
    for (const control of rgaaControls) {
      expect(control.code).not.toMatch(/^RGAA \d+\.\d+\.\d+$/);
    }
  });

  it("keeps unique control ids and unique checkIds among automated controls", () => {
    const ids = rgaaControls.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const checkIds = rgaaControls
      .map((c) => c.checkId)
      .filter((id): id is string => id !== null);
    expect(new Set(checkIds).size).toBe(checkIds.length);
  });

  it("does not duplicate control ids inside a preset", () => {
    for (const preset of [...rgaaPresets, ...wcagPresets]) {
      expect(new Set(preset.controlIds).size, preset.id).toBe(
        preset.controlIds.length,
      );
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/adapters/rgaa/catalog-coverage.test.ts`

Expected: FAIL — missing criteria (at least `1.5`, `4.6`, `4.8`, …) and `RGAA 13.9.1` matches the invalid-code assertion.

- [ ] **Step 3: Do not add production code in this task**

Leave the test red. Task 2 makes it pass.

- [ ] **Step 4: Commit**

```bash
git add src/adapters/rgaa/catalog-coverage.test.ts
git commit -m "$(cat <<'EOF'
test: assert Full RGAA catalogs all 106 4.1.2 criteria

EOF
)"
```

---

### Task 2: Missing human controls + recodes

**Files:**
- Modify: `src/adapters/rgaa/controls.ts`
- Modify: `src/adapters/rgaa/presets.ts`
- Modify: `src/adapters/wcag/presets.ts`
- Test: `src/adapters/rgaa/catalog-coverage.test.ts` (from Task 1)

**Interfaces:**
- Consumes: existing `Control` shape (`id`, `frameworkId`, `code`, `secondaryCode`, `title`, `description`, `checkId`, `complianceWeight`)
- Produces: new control ids listed below; recoded `code` / `secondaryCode` / titles on existing controls. No new `CheckId` yet except recoding `use-of-color` to RGAA 10.6 (same check, new primary code). New 3.1 control is human-only.

- [ ] **Step 1: Recode existing controls** (no new CheckId)

In `controls.ts`, apply these exact field changes:

| id | New `code` | New `secondaryCode` | Title / description change |
| --- | --- | --- | --- |
| `ctl-no-orientation-lock` | `RGAA 13.9` | `WCAG 1.3.4` | keep title |
| `ctl-lang-parts` | `RGAA 8.8` | `WCAG 3.1.2` | title: "Language-change codes are valid" (validity only) |
| `ctl-empty-heading` | `RGAA 9.1` | `WCAG 1.3.1` | keep |
| `ctl-use-of-color` | `RGAA 10.6` | `WCAG 1.4.1` | title: "Links are distinguishable from surrounding text" |
| `ctl-label-in-name` | `WCAG 2.5.3` | `WCAG 2.5.3` | keep (WCAG-only, like target-size) |
| `ctl-keyboard-interaction` | `RGAA 7.3` | `WCAG 2.1.1` | title already keyboard; description: scripts/widgets operable from keyboard |
| `ctl-no-autofocus` | `RGAA 13.2` | `WCAG 3.2.1` | title stays; 13.2 already has `new-window-onload` — two checks on 13.2 is OK |
| `ctl-duplicate-id` | `RGAA 8.2` | `WCAG 4.1.2` | description: unique IDs in the generated tree (not “document is valid”). Drop 4.1.1 |
| `ctl-search-relevant` | `RGAA 12.4` | `WCAG 2.4.5` | title: "Sitemap is reached the same way on every page"; description: identical sitemap entry point |
| `ctl-nav-mechanisms-relevant` | `RGAA 12.5` | `WCAG 2.4.5` | title: "Search is reached the same way on every page" |
| `ctl-bypass` | `RGAA 12.7` | `WCAG 2.4.1` | keep (skip link) — remove `no-autofocus` from this code |

`no-autofocus` on 13.2 shares a criterion with `new-window-onload` (different checkIds — allowed).

- [ ] **Step 2: Add missing controls** (`checkId: null` unless noted)

Append before the closing `];` of `rgaaControls`. Use `frameworkId: rgaaFramework.id`.

```typescript
{
  id: "ctl-captcha-alternative",
  frameworkId: rgaaFramework.id,
  code: "RGAA 1.5",
  secondaryCode: "WCAG 1.1.1",
  title: "CAPTCHA has a non-image alternative",
  description:
    "When an image CAPTCHA is used, a different modality (audio, logic question, or human contact) provides the same function.",
  checkId: null,
  complianceWeight: 1.2,
},
{
  id: "ctl-audio-description-relevant",
  frameworkId: rgaaFramework.id,
  code: "RGAA 4.6",
  secondaryCode: "WCAG 1.2.5",
  title: "Audio description is pertinent",
  description:
    "When audio description is provided, it matches the visual information that is not in the soundtrack.",
  checkId: null,
  complianceWeight: 1.2,
},
{
  id: "ctl-nontemporal-media-alt",
  frameworkId: rgaaFramework.id,
  code: "RGAA 4.8",
  secondaryCode: "WCAG 1.1.1",
  title: "Non-temporal media has a text alternative",
  description:
    "Object, embed, and canvas media that is not time-based expose a name or an adjacent alternative.",
  checkId: null, // Task 6 attaches a check
  complianceWeight: 1.2,
},
{
  id: "ctl-nontemporal-media-alt-relevant",
  frameworkId: rgaaFramework.id,
  code: "RGAA 4.9",
  secondaryCode: "WCAG 1.1.1",
  title: "Non-temporal media alternatives are pertinent",
  description:
    "Text alternatives for object, embed, and canvas media describe the content accurately.",
  checkId: null,
  complianceWeight: 1.1,
},
{
  id: "ctl-media-at-compatible",
  frameworkId: rgaaFramework.id,
  code: "RGAA 4.13",
  secondaryCode: "WCAG 4.1.2",
  title: "Media players are compatible with assistive technology",
  description:
    "Temporal and non-temporal media expose name, role, and value to assistive technology.",
  checkId: null,
  complianceWeight: 1.2,
},
{
  id: "ctl-lang-change-indicated",
  frameworkId: rgaaFramework.id,
  code: "RGAA 8.7",
  secondaryCode: "WCAG 3.1.2",
  title: "Language changes are indicated in the source",
  description:
    "Passages in a language different from the page default set lang on the containing element.",
  checkId: null, // presence of foreign-language spans is human unless a later HEUR
  complianceWeight: 1.3,
},
{
  id: "ctl-css-for-presentation",
  frameworkId: rgaaFramework.id,
  code: "RGAA 10.1",
  secondaryCode: "WCAG 1.3.1",
  title: "Presentation is controlled with CSS, not markup",
  description:
    "Layout and visual formatting use stylesheets rather than deprecated presentational markup.",
  checkId: null,
  complianceWeight: 1.0,
},
{
  id: "ctl-css-off-understandable",
  frameworkId: rgaaFramework.id,
  code: "RGAA 10.3",
  secondaryCode: "WCAG 1.3.2",
  title: "Content remains understandable with CSS disabled",
  description:
    "Reading order and meaning are preserved when stylesheets are disabled.",
  checkId: null,
  complianceWeight: 1.1,
},
{
  id: "ctl-info-not-color-only",
  frameworkId: rgaaFramework.id,
  code: "RGAA 3.1",
  secondaryCode: "WCAG 1.4.1",
  title: "Information is not conveyed by color alone",
  description:
    "Charts, required fields, and status are identifiable without perceiving color. Link underline is a separate control (10.6).",
  checkId: null,
  complianceWeight: 1.4,
},
{
  id: "ctl-css-hover-keyboard",
  frameworkId: rgaaFramework.id,
  code: "RGAA 10.14",
  secondaryCode: "WCAG 2.1.1",
  title: "CSS-only extra content is available from the keyboard",
  description:
    "Content shown only via :hover or :focus CSS can also be revealed with keyboard focus.",
  checkId: null, // Wave 4 attaches runtime
  complianceWeight: 1.2,
},
{
  id: "ctl-field-grouping",
  frameworkId: rgaaFramework.id,
  code: "RGAA 11.5",
  secondaryCode: "WCAG 1.3.1",
  title: "Related fields are grouped when needed",
  description:
    "Radio groups, related checkboxes, and identity field clusters are wrapped in a fieldset or labelled group.",
  checkId: null, // Task 7 / P1.7 attaches AST; fieldset-legend stays 11.6
  complianceWeight: 1.2,
},
{
  id: "ctl-office-docs-equivalent",
  frameworkId: rgaaFramework.id,
  code: "RGAA 13.4",
  secondaryCode: "WCAG 1.1.1",
  title: "Accessible office alternatives are equivalent",
  description:
    "HTML or text alternatives to downloadable office files carry the same information.",
  checkId: null,
  complianceWeight: 1.1,
},
{
  id: "ctl-cryptic-content-alt",
  frameworkId: rgaaFramework.id,
  code: "RGAA 13.5",
  secondaryCode: "WCAG 1.1.1",
  title: "Cryptic content has a text alternative",
  description:
    "ASCII art, emoticon clusters, and similar cryptic text have an accessible alternative.",
  checkId: null,
  complianceWeight: 1.0,
},
{
  id: "ctl-cryptic-content-alt-relevant",
  frameworkId: rgaaFramework.id,
  code: "RGAA 13.6",
  secondaryCode: "WCAG 1.1.1",
  title: "Cryptic-content alternatives are pertinent",
  description:
    "Alternatives for cryptic content convey the intended meaning.",
  checkId: null,
  complianceWeight: 1.0,
},
{
  id: "ctl-captions-live",
  frameworkId: rgaaFramework.id,
  code: "WCAG 1.2.4",
  secondaryCode: "WCAG 1.2.4",
  title: "Live synchronized media has captions",
  description:
    "When live audio is part of synchronized media, captions are provided.",
  checkId: null,
  complianceWeight: 1.3,
},
{
  id: "ctl-audio-description-or-alt",
  frameworkId: rgaaFramework.id,
  code: "WCAG 1.2.3",
  secondaryCode: "WCAG 1.2.3",
  title: "Prerecorded video has audio description or a media alternative",
  description:
    "Video with visual information not in the soundtrack has audio description or a full text alternative (A).",
  checkId: null,
  complianceWeight: 1.3,
},
```

- [ ] **Step 3: Presets — unique ids, include new controls on Full (automatic via `rgaaControls.map`), add new ids to AA where A/AA**

Full presets already use `rgaaControls.map((c) => c.id)` — they pick up new ids automatically.

In `rgaa/presets.ts` and `wcag/presets.ts`:
1. Delete duplicate entries (`ctl-html-lang-valid`, `ctl-table-summary`, `ctl-image-detailed-description`, `ctl-media-controls-present` appear twice in AA/AAA).
2. Add to **AA** arrays (RGAA AA = A+AA of 4.1.2 plus existing WCAG 2.2):  
   `ctl-captcha-alternative`, `ctl-audio-description-relevant`, `ctl-nontemporal-media-alt`, `ctl-nontemporal-media-alt-relevant`, `ctl-media-at-compatible`, `ctl-lang-change-indicated`, `ctl-css-for-presentation`, `ctl-css-off-understandable`, `ctl-info-not-color-only`, `ctl-css-hover-keyboard`, `ctl-field-grouping`, `ctl-office-docs-equivalent`, `ctl-cryptic-content-alt`, `ctl-cryptic-content-alt-relevant`, `ctl-captions-live`, `ctl-audio-description-or-alt`.
3. AAA arrays = AA arrays plus the extra-heuristic controls already there (`pointer-gesture`, etc.). Do not add WCAG AAA SCs in this task.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/adapters/rgaa/catalog-coverage.test.ts src/adapters/rgaa/presets.test.ts src/adapters/wcag/presets.test.ts src/adapters/registry.test.ts`

Expected: PASS. If `registry.test.ts` unique-checkId fails, a recode accidentally reused a checkId — fix.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/rgaa/controls.ts src/adapters/rgaa/presets.ts src/adapters/wcag/presets.ts src/adapters/rgaa/catalog-coverage.test.ts
git commit -m "$(cat <<'EOF'
fix: catalog all RGAA 4.1.2 criteria under the correct codes

EOF
)"
```

---

### Task 3: WCAG 2.2 naming (display only)

**Files:**
- Modify: `src/adapters/wcag/controls.ts`
- Modify: `src/adapters/wcag/presets.ts`
- Modify: `src/adapters/rgaa/presets.ts` (AAA descriptions)
- Modify: `src/components/requirements/requirements-intake-panel.test.tsx`
- Modify: `README.md` (one line: WCAG 2.2)
- Modify: `docs/ai/architecture.md` (preset names)

**Interfaces:**
- Consumes: stable id `fw-wcag-2-1`
- Produces: display name `WCAG 2.2 (accessibility standard)`; presets `Full WCAG 2.2`, `WCAG 2.2 AA`, `WCAG 2.2 extra checks` (not “AAA”)

- [ ] **Step 1: Write the failing UI test change**

In `requirements-intake-panel.test.tsx` replace `/Full WCAG 2.1/` with `/Full WCAG 2.2/` and `/WCAG 2.1 AA /` with `/WCAG 2.2 AA /`. If the third radio is asserted, expect `/WCAG 2.2 extra/`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/requirements/requirements-intake-panel.test.tsx`

Expected: FAIL on radio accessible name.

- [ ] **Step 3: Update strings**

```typescript
// src/adapters/wcag/controls.ts
export const wcagFramework: Framework = {
  id: "fw-wcag-2-1",
  name: "WCAG 2.2 (accessibility standard)",
  version: "2026.3",
};
```

Preset `name` / `description`:
- Full: `Full WCAG 2.2` — every catalog control
- AA: `WCAG 2.2 AA` — A and AA success criteria in the catalog
- Extra: id stays `preset-wcag-aaa` (persisted) but `name`: `WCAG 2.2 extra checks`, `description`: `AA plus extra heuristic checks; not WCAG AAA`

Same pattern for RGAA extra preset: `name`: `RGAA 4 extra checks` (id `preset-rgaa-aaa` unchanged).

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/components/requirements/requirements-intake-panel.test.tsx src/adapters/wcag/presets.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/adapters/wcag/controls.ts src/adapters/wcag/presets.ts src/adapters/rgaa/presets.ts src/components/requirements/requirements-intake-panel.test.tsx README.md docs/ai/architecture.md
git commit -m "$(cat <<'EOF'
fix: label WCAG presets as 2.2 without renaming persisted ids

EOF
)"
```

---

### Task 4: Expand `img-alt` AST (RGAA 1.1)

**Files:**
- Modify: `src/analysis/checks/img-alt.ts`
- Modify: `src/analysis/checks/img-alt.test.ts`
- Modify: `packages/check/testdata/Coverage.tsx` (add failing hosts)
- Modify: `src/analysis/runtime/axe-map.ts` (`server-side-image-map` → `img-alt`)
- Modify: `src/analysis/runtime/axe-map.test.ts`

**Interfaces:**
- Consumes: `visitJsxTags`, `getAttribute`, `hasAriaName` from jsx-primitives, `isPresentationRole` / `isAriaHidden`
- Produces: same `img-alt` `RawFinding[]`; no new CheckId

- [ ] **Step 1: Write failing tests** (append to `img-alt.test.ts`)

```typescript
it("requires alt on area and input type=image", () => {
  expect(
    imgAltCheck.run(
      parseSource("test.tsx", `const A = () => <area href="/a" />;`),
    ),
  ).toHaveLength(1);
  expect(
    imgAltCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => <input type="image" src="/go.png" />;`,
      ),
    ),
  ).toHaveLength(1);
});

it("requires a name on role=img, object image, embed, and canvas", () => {
  const hosts = [
    `<div role="img" />`,
    `<object type="image/png" data="/a.png" />`,
    `<embed type="image/svg+xml" src="/a.svg" />`,
    `<canvas width={10} height={10} />`,
  ];
  for (const jsx of hosts) {
    expect(
      imgAltCheck.run(parseSource("test.tsx", `const A = () => ${jsx};`)),
      jsx,
    ).not.toHaveLength(0);
  }
});

it("accepts aria-label on role=img and skips decorative canvas", () => {
  expect(
    imgAltCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => <div role="img" aria-label="Chart" />;`,
      ),
    ),
  ).toHaveLength(0);
  expect(
    imgAltCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => <canvas aria-hidden="true" />;`,
      ),
    ),
  ).toHaveLength(0);
});

it("flags server-side image maps", () => {
  expect(
    imgAltCheck.run(
      parseSource(
        "test.tsx",
        `const A = () => <img src="/map.png" alt="Campus" isMap />;`,
      ),
    ),
  ).toHaveLength(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/analysis/checks/img-alt.test.ts`

Expected: FAIL — current check only visits `img` / `Image`.

- [ ] **Step 3: Implement**

Keep existing `<img>` / `Image` logic. Additionally:

- `area`: require `alt` or `aria-label` / `aria-labelledby` (same as `hasAriaName` + alt).
- `input` with `type="image"`: require alt or ARIA name.
- `role="img"` on any host: require ARIA name (not `alt` unless `img`).
- `object` with `type` starting `image/`: require ARIA name or `title`.
- `embed` with `type` starting `image/`: same.
- `canvas`: if not `aria-hidden` / presentation, require ARIA name or non-empty children (RGAA 1.1.8).
- `img`/`Image` with `isMap` / `ismap`: always emit a finding (1.1.4) even if alt exists — reason: server-side image map needs an alternative link set.

Skip `isPropSpreadingHost`. Skip `isAriaHidden` / presentation for decorative canvas/object.

- [ ] **Step 4: Map axe**

```typescript
"server-side-image-map": "img-alt",
```

Add expect in `axe-map.test.ts`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/analysis/checks/img-alt.test.ts src/analysis/runtime/axe-map.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/analysis/checks/img-alt.ts src/analysis/checks/img-alt.test.ts src/analysis/runtime/axe-map.ts src/analysis/runtime/axe-map.test.ts packages/check/testdata/Coverage.tsx
git commit -m "$(cat <<'EOF'
fix: cover RGAA 1.1 image hosts beyond img and Image

EOF
)"
```

---

### Task 5: Informative SVG requires `role="img"` (RGAA 1.1.5)

**Files:**
- Modify: `src/analysis/checks/svg-name.ts`
- Modify: `src/analysis/checks/svg-name.test.ts`

**Interfaces:**
- Consumes: existing `svg-name` check
- Produces: extra finding when standalone informative SVG has a name but no `role="img"`

- [ ] **Step 1: Write failing test**

```typescript
it("requires role=img on a named informative svg", () => {
  const findings = svgNameCheck.run(
    parseSource(
      "test.tsx",
      `const A = () => <svg aria-label="Logo"><title>Logo</title></svg>;`,
    ),
  );
  expect(findings.some((f) => /role="img"/.test(f.reason))).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/analysis/checks/svg-name.test.ts`

Expected: FAIL (currently returns [] when named)

- [ ] **Step 3: Implement**

After the existing “no name” branch, if the SVG is not decorative and `role` is not `img`, push a violation: `Standalone <svg> that conveys information must set role="img" (RGAA 1.1.5).`

Decorative (`aria-hidden`, presentation, inside a naming host) still skip.

- [ ] **Step 4: Run tests — expected PASS**

- [ ] **Step 5: Commit**

```bash
git add src/analysis/checks/svg-name.ts src/analysis/checks/svg-name.test.ts
git commit -m "$(cat <<'EOF'
fix: require role=img on informative SVG (RGAA 1.1.5)

EOF
)"
```

---

### Task 6: Non-temporal media alternative AST (RGAA 4.8)

**Files:**
- Create: `src/analysis/checks/nontemporal-media-alt.ts`
- Create: `src/analysis/checks/nontemporal-media-alt.test.ts`
- Modify: `src/analysis/types.ts` (`CheckId` += `"nontemporal-media-alt"`)
- Modify: `src/analysis/checks/registry.ts`
- Modify: `src/adapters/rgaa/guidance.ts`
- Modify: `src/adapters/rgaa/controls.ts` — set `ctl-nontemporal-media-alt.checkId` to `"nontemporal-media-alt"`
- Modify: `src/adapters/guidance.test.ts` / `guidance.test.ts` only if they enumerate CheckIds exhaustively (they use `Record<CheckId>` so guidance.ts must compile)

**Interfaces:**
- Consumes: `AccessibilityCheck`, parse helpers
- Produces: `nontemporalMediaAltCheck: AccessibilityCheck`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { nontemporalMediaAltCheck } from "./nontemporal-media-alt";

describe("nontemporal-media-alt", () => {
  it("flags object, embed, and canvas without a name or adjacent alternative", () => {
    expect(
      nontemporalMediaAltCheck.run(
        parseSource("t.tsx", `const A = () => <object data="/doc.pdf" />;`),
      ),
    ).toHaveLength(1);
    expect(
      nontemporalMediaAltCheck.run(
        parseSource("t.tsx", `const A = () => <embed src="/x.swf" />;`),
      ),
    ).toHaveLength(1);
  });

  it("accepts aria-label or a following sibling link", () => {
    expect(
      nontemporalMediaAltCheck.run(
        parseSource(
          "t.tsx",
          `const A = () => <object data="/doc.pdf" aria-label="Report" />;`,
        ),
      ),
    ).toHaveLength(0);
  });

  it("ignores image/* object (owned by img-alt)", () => {
    expect(
      nontemporalMediaAltCheck.run(
        parseSource(
          "t.tsx",
          `const A = () => <object type="image/png" data="/a.png" />;`,
        ),
      ),
    ).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** (module not found)

- [ ] **Step 3: Implement minimal check**

Visit `object`, `embed`, `canvas`. Skip `type` starting with `image/` (Task 4). Skip `video`/`audio`. Skip aria-hidden / presentation. Pass if `hasAriaName`, `title`, or non-empty children (canvas). Adjacent-sibling `<a>` / `<button>` in the same JSX parent counts as alternative (walk `parent` children after this node).

- [ ] **Step 4: Wire CheckId, registry, guidance, control.checkId**

Guidance:

```typescript
"nontemporal-media-alt": {
  impact:
    "Embedded documents and canvases without a name are silent for assistive technology (WCAG 1.1.1 / RGAA 4.8).",
  howToFix:
    "Add aria-label or aria-labelledby, or place a link/button immediately after the embed that opens a text alternative.",
},
```

- [ ] **Step 5: Run** `npx vitest run src/analysis/checks/nontemporal-media-alt.test.ts src/adapters/rgaa/guidance.test.ts src/adapters/registry.test.ts`

Expected: PASS (`registry` unique checkId still holds)

- [ ] **Step 6: Commit**

```bash
git add src/analysis/checks/nontemporal-media-alt.ts src/analysis/checks/nontemporal-media-alt.test.ts src/analysis/types.ts src/analysis/checks/registry.ts src/adapters/rgaa/guidance.ts src/adapters/rgaa/controls.ts
git commit -m "$(cat <<'EOF'
feat: detect missing alternatives on object, embed, and canvas

EOF
)"
```

---

### Task 7: Related-field grouping AST (RGAA 11.5)

**Files:**
- Create: `src/analysis/checks/field-grouping.ts`
- Create: `src/analysis/checks/field-grouping.test.ts`
- Modify: `types.ts`, `registry.ts`, `guidance.ts`, `controls.ts` (`ctl-field-grouping.checkId = "field-grouping"`)

**Interfaces:**
- Consumes: patterns from `fieldset-legend.ts` (`isInsideGrouping`)
- Produces: `fieldGroupingCheck` — radios already covered by 11.6; this check is **checkboxes sharing a `name`**, or two consecutive `input` with identity autocomplete (`given-name` + `family-name`, `address-line1` + `address-line2`) not inside a grouping host

- [ ] **Step 1: Failing tests** — checkbox group `name="interests"` length ≥2 outside fieldset; identity pair without fieldset. Clean: same inside `<fieldset>`.

- [ ] **Step 2: Run — FAIL** (module missing)

- [ ] **Step 3: Implement** — reuse `isInsideGrouping` from fieldset-legend by exporting it from `fieldset-legend.ts` **or** duplicate the 15-line helper in `field-grouping.ts` (prefer duplicate over a one-off util).

- [ ] **Step 4: Wire + guidance**

- [ ] **Step 5: `npx vitest run src/analysis/checks/field-grouping.test.ts` — PASS**

- [ ] **Step 6: Commit** `feat: flag ungrouped related form fields (RGAA 11.5)`

---

### Task 8: Axe mappings (no new Playwright)

**Files:**
- Modify: `src/analysis/runtime/axe-map.ts`
- Modify: `src/analysis/runtime/axe-map.test.ts`
- Modify: `src/analysis/runtime/custom-checks.test.ts` if needed

**Interfaces:**
- Consumes: existing CheckIds
- Produces: additional `AXE_TO_CHECK` entries. Do **not** map `color-contrast-enhanced` to `color-contrast`.

- [ ] **Step 1: Failing tests**

```typescript
expect(checkIdForAxeRule("accesskeys")).toBe("no-accesskey");
expect(checkIdForAxeRule("label-title-only")).toBe("input-label");
expect(checkIdForAxeRule("landmark-banner-is-top-level")).toBe("landmark-one-main");
expect(checkIdForAxeRule("landmark-contentinfo-is-top-level")).toBe("landmark-one-main");
expect(checkIdForAxeRule("landmark-no-duplicate-banner")).toBe("landmark-unique");
expect(checkIdForAxeRule("landmark-no-duplicate-contentinfo")).toBe("landmark-unique");
expect(checkIdForAxeRule("color-contrast-enhanced")).toBeUndefined();
```

Remove or replace the implicit mapping: delete `"color-contrast-enhanced": "color-contrast"` from `axe-map.ts`.

- [ ] **Step 2: Run — FAIL** on unmapped ids and enhanced still mapped

- [ ] **Step 3: Add the five mappings; delete enhanced**

- [ ] **Step 4: Run axe-map tests — PASS**

- [ ] **Step 5: Commit** `fix: map remaining A/AA axe rules and stop folding AAA contrast into AA`

---

### Task 9: Site-level consistent help (WCAG 3.2.6)

**Files:**
- Modify: `src/analysis/runtime/site-level/types.ts`
- Modify: `src/analysis/runtime/site-level/snapshot.ts`
- Modify: `src/analysis/runtime/site-level/checks.ts`
- Modify: `src/analysis/runtime/site-level/checks.test.ts`
- Modify: `src/analysis/check-authority.ts` — add `"consistent-help"` to `RUNTIME_ONLY_CHECK_IDS` and `SITE_LEVEL_CHECK_IDS`
- Modify: `src/analysis/types.ts` — already has no `consistent-help` CheckId; **add** `"consistent-help"`
- Modify: `src/adapters/rgaa/controls.ts` — `ctl-consistent-help.checkId = "consistent-help"`
- Modify: `src/adapters/rgaa/guidance.ts`
- Modify: `src/analysis/runtime/custom-checks.test.ts` not required (site-level, not axe)

**Interfaces:**
- Consumes: `RuntimePageSnapshot`
- Produces: `helpLinks: string[]` on the snapshot (`label::href` like nav); `runSiteLevelChecks` may emit `consistent-help`

- [ ] **Step 1: Failing test** in `checks.test.ts`

Build two snapshots whose `helpLinks` order differs (`Contact` then `Chat` vs reverse). Expect a `consistent-help` finding. Two snapshots with the same order: no finding. Fewer than two snapshots: no finding (existing guard).

- [ ] **Step 2: Run — FAIL** (property missing)

- [ ] **Step 3: Snapshot collection**

In `capturePageSnapshot` `page.evaluate`, collect anchors whose accessible name or href matches `/help|support|contact|chat|faq/i` (English + `aide|contact|support` for FR). Same `label::href` serialization as nav.

Compare signatures `helpLinks.join(">")` across pages that have at least one help link. If two or more pages have help links and signatures differ → finding.

Empty help on all pages: no finding (mechanism absent ≠ inconsistent). That stays a human 3.2.6 miss if help exists in content we did not detect.

- [ ] **Step 4: Authority + guidance + control.checkId**

- [ ] **Step 5: Run** `npx vitest run src/analysis/runtime/site-level/checks.test.ts src/server/assessment-status.test.ts`

Expected: PASS. If assessment-status site-level tests enumerate ids, add `consistent-help`.

- [ ] **Step 6: Commit** `feat: compare help-link order across preview routes`

---

### Task 10: Wave 0–1 docs and counts

**Files:**
- Modify: `docs/ai/architecture.md` — AST 64 ( +2 ), runtime-only 34 (+ consistent-help), site-level 4; list new check ids
- Modify: `docs/missing-rules.md` — flip 1.5/4.6/4.8/… from MISS to MAN or AST; 1.1 PART note img hosts; 10.6 AST; 3.1 MAN; 13.9 MAP fixed

- [ ] **Step 1: Update counts from `allChecks.length` and `RUNTIME_ONLY_CHECK_IDS.length` after Tasks 4–9**

- [ ] **Step 2: Run full gate**

Run: `npm run lint && npm run typecheck && npm run test`

Expected: PASS

- [ ] **Step 3: Commit** `docs: record wave 1 RGAA/WCAG coverage`

---

## Later waves (separate PRs; do not start until Wave 0–1 ships)

Each later wave gets its own plan with TDD snippets. Scope locked here so implementers do not skip the honesty work.

### Wave 2 — Deepen existing engines (`docs/missing-rules.md` P1)

| Task | Check | Files | Behavior |
| --- | --- | --- | --- |
| 11 | Resize text 10.4 | new `custom-checks/resize-text.ts`, runtime-only `resize-text` | Set viewport font scale / `document.documentElement.style.fontSize = 200%` (or zoom 2) and fail if horizontal overflow beyond `reflow` 320px path. Distinct CheckId from `reflow`. |
| 12 | Time limits 13.1 | extend `no-auto-refresh` AST: `setInterval`/`setTimeout` calling `location` / `router.push`; keep axe meta-refresh | warning confidence medium |
| 13 | Audio transcript 4.1 | `audio-caption.ts` pass if next sibling link text matches `/transcript\|transcription\|texte/i` or `aria-describedby` | do not require `<track>` when transcript link exists |
| 14 | Descriptions track 4.5 | new HEUR `audio-description-track` on `ctl-audio-description` **or** keep MAN and add warning-only AST — prefer warning checkId `audio-description-track` attached to 4.5, assessment still not high-fail | `<video>` without `kind="descriptions"` → warning |
| 15 | 10.14 CSS hover | `custom-checks/css-hover-keyboard.ts` | elements with computed content visible only `:hover` and not `:focus` |
| 16 | css-disabled-content | return **all** hits, not first | change `evaluate` to collect array |
| 17 | 6.1 link purpose HEUR | new warning check `link-explicit-heuristic` on `ctl-link-explicit` | names matching `/^(click here\|read more\|ici\|en savoir plus)$/i` |
| 18 | 13.2 new window | extend `new-window-onload` or new AST: `target="_blank"` without warning text / `aria-describedby` | warning |
| 19 | 13.3 office links | HEUR `href` `/\.(pdf\|docx?\|odt\|pptx?)$/i` without adjacent HTML alternative | warning on `ctl-office-docs-alt` — **cannot** set checkId on that control if we also want to keep it human-only. Add sibling control `ctl-office-docs-alt-present` with the check, keep 13.3 pertinence human **or** attach the HEUR check and use P3 unable_to_verify-when-clean. Prefer sibling control to preserve MAN 13.3. |
| 20 | 4.12 promote | attach `media-keyboard-static` CheckId to object/embed without keyboard handlers | runtime-only or AST |

### Wave 3 — Site-level 12.4 / 12.5 / 12.6

Extend `RuntimePageSnapshot` with `sitemapHref?: string`, `searchSelector?: string`, `landmarkRoles: string[]`. Compare presence and relative order of sitemap and search entry points. Fail 12.6 when a route is missing `main` or `header` while others have them (in addition to axe landmarks). Recode `ctl-search-relevant` / `ctl-nav-mechanisms-relevant` to these checks when they are no longer human-only.

### Wave 4 — Heuristic honesty (P3)

Add `HEURISTIC_CHECK_IDS` in `check-authority.ts`. Assessment: if the only engine is AST and the check is heuristic, empty findings → `unable_to_verify`, not `passed`. Cover in `assessment-status.test.ts`. List of ids: `image-detailed-description`, `image-of-text`, `table-summary`, `sensory-characteristics`, `error-suggestion`, `pointer-gesture`, `pointer-cancellation`, `motion-actuation`, `focus-context-change`, `input-context-change`. `blockquote-cite` stays AST pass/fail for its narrow rule.

### Wave 5 — Explicitly out of scope

No detectors for 13.7 flashing, 1.4/1.5 CAPTCHA quality, live 1.2.4 media analysis, full HTML validators as 8.2, WCAG AAA SCs, reading-level.

---

## Self-review

1. **Spec coverage:** P0.1–P0.10 and Wave 1 AST from `docs/missing-rules.md` have tasks 1–9. P1–P3 are Wave 2–4 with file names and behaviors. P4 is listed as out of scope.
2. **Placeholders:** none — later waves name files, CheckIds, and pass/fail behavior.
3. **Types:** new CheckIds `nontemporal-media-alt`, `field-grouping`, `consistent-help` (and later `resize-text`, `audio-description-track`, `link-explicit-heuristic`, `css-hover-keyboard`, `media-keyboard-static`) are unique; `fw-wcag-2-1` id is unchanged.
4. **Registry constraint:** 3.1 is a new human control; `use-of-color` moves to 10.6 so checkIds stay 1:1.

---

Plan complete. After Wave 0–1, open a new plan file for Wave 2 rather than extending this one past reviewable size.

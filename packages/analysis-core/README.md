# analysis-core

Deterministic accessibility analysis: AST checks over source plus optional
runtime audits (Playwright/axe) of a preview URL. AI is separate (`src/ai/`)
and never authoritative.

Planned: an environmental `measurement/` stage (browser-observable metrics)
sharing this package — direction only, not implemented. See
[`docs/ai/platform-direction.md`](../../docs/ai/platform-direction.md).

## Pipeline stages

Server code (`src/server/assessment/assessment.ts`) drives exactly four
stages and imports only their entries — never engine internals:

1. **AST scan** — `src/scan.ts` (`scanProject`, `scanChangedFiles`,
   `scanFile`): file discovery → per-file checks (`checks/registry.ts` +
   jsx-a11y) → `ScanResult`.
2. **Runtime scan** — `src/runtime/scan.ts` (`scanRuntime`, injectable via
   `RuntimePageScanner`): SSRF-safe navigation → axe + custom probes +
   html-validate + link checks → `RuntimeScanResult`.
3. **Merge** — `src/merge-findings.ts` (`mergeRawFindings`,
   `dedupeRuntimeFindings`): combines AST + runtime rows, drops superseded
   AST findings when a commit-tied runtime audit ran (`runtimeRan` is that
   flag; the app layer decides tying). The drop is scoped by `RuntimeFileCoverage`
   (the app layer maps rendered routes → page files); omitted/unknown coverage
   keeps AST findings rather than assuming the whole repo was rendered.
4. **Status derivation** — `src/check-authority.ts`
   (`deriveStatusForCheck`) over `src/contract/requirement-status.ts`
   (`deriveRequirementStatus`): check id → authority class → requirement
   status. Pure.

## Leaves (import freely, both directions within the package)

- Shared AST: `src/parse.ts`, `src/jsx-primitives.ts`, `src/a11y-aria.ts`,
  `src/a11y-model.ts`
- Vocabulary: `src/contract/*` (entities, statuses, location,
  finding-types, requirement-status, assessment-jobs)
- Reference data: `src/catalog/*` (RGAA/WCAG controls, presets, guidance)
- Small utils: `src/fixes.ts`, `src/workspace-path.ts`,
  `src/source-files.ts`, `src/analyzer-versions.ts`

## Rules

- Engine internals (`src/checks/*`, `src/runtime/custom-checks/*`,
  `src/runtime/site-level/*`) are imported only by their stage entry.
- Adding a check id: `CHECK_IDS` → registry or jsx-a11y map → authority
  list → runtime map if needed → catalog `checkId` → `guidance.ts`.
  Tests: `check-authority.test.ts`, `catalog-coverage.test.ts`.

## Known limits (documented, not bugs)

- **Focus walk budget** — one shared Tab traversal inspects at most
  `MAX_FOCUS_TAB_STEPS` (200) stops per page. A longer tab order emits an
  `advisory` finding on each focus check (`focus-visible`, `keyboard-trap`,
  `focus-not-obscured`) so the requirement reads `needs_review`, never a
  silent `passed`. Advisories are warnings, never failures.
- **Contrast `incomplete` resolution** — axe nodes the pixel sampler can
  decide (gradient/overlapping/image backgrounds) are resolved by
  `runtime/incomplete-resolver.ts`. Gradient-clip text
  (`bg-clip-text text-transparent`) and translucent pills stay
  `needs_review`: their effective color depends on per-glyph gradient pixels
  or the compositing stack, so they are manual-review cases by design.

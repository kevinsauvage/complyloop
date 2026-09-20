# Over-engineering audit — cleanup TODO

Full-repo ponytail audit (complexity only; correctness, security, performance
excluded). Ordered biggest cut first. Each item is a pure simplification or
deletion with no behavior change unless noted. Tags: `delete` (dead code /
unused flexibility), `stdlib` (stdlib ships it), `native` (platform does it),
`yagni` (abstraction with one consumer), `shrink` (same logic, fewer lines).

Verify each with `rg "<symbol>" src packages scripts e2e --glob '!**/node_modules/**'`
before deleting, then run `npm run verify:gate`.

---

## UI primitives (repo rule: no primitive without 2+ consumers)

- [ ] `delete:` Drop unused `ui/dropdown-menu.tsx` subcomponents (Portal/Group/CheckboxItem/RadioGroup/RadioItem/Shortcut/Sub*). `src/components/ui/dropdown-menu.tsx:15-255` (~115 lines)
- [ ] `native:` `ui/table.tsx` single consumer → plain `<table>` + classes. `src/components/ui/table.tsx:1-114` (~95 lines)
- [ ] `yagni:` `ui/sheet.tsx` single consumer → `ui/dialog` or native `<dialog>`. `src/components/ui/sheet.tsx:1-146` (~90 lines)
- [ ] `yagni:` `ui/avatar.tsx` single consumer → `<img>` + initials span. `src/components/ui/avatar.tsx:1-60` (~50 lines)
- [ ] `delete:` `ui/tooltip.tsx` — only `TooltipProvider` consumed; `Tooltip/Trigger/Content` unused → drop file + layout provider. `src/components/ui/tooltip.tsx:1-57` (~50 lines)
- [ ] `delete:` Drop `ui/alert-dialog.tsx` `AlertDialogMedia`/`AlertDialogAction`. `src/components/ui/alert-dialog.tsx:102-116,150-166` (~30 lines)
- [ ] `yagni:` `ui/collapsible.tsx` three pass-through wrappers, one consumer → native `<details>/<summary>`. `src/components/ui/collapsible.tsx:1-33` (~28 lines)
- [ ] `native:` `ui/separator.tsx` single consumer → `<hr>` / `border-t`. `src/components/ui/separator.tsx:1-28` (~25 lines)
- [ ] `delete:` Drop `ui/dialog.tsx` `DialogClose`/`DialogFooter`. `src/components/ui/dialog.tsx:28-32,97-122` (~25 lines)
- [ ] `delete:` Drop `ui/card.tsx` `CardAction`/`CardFooter`. `src/components/ui/card.tsx:64-75,87-98` (~22 lines)
- [ ] `delete:` Drop unused `AlertAction` export. `src/components/ui/alert.tsx:66-74` (~9 lines)

## analysis-core

> **Correction — many "test-only" flags here are actually drift-gate inputs, not dead code.**
> `CheckRegistration.analyzers`, `CUSTOM_PROBE_CHECK_IDS`, `axeMappedCheckIds`,
> `REJECTED_AXE_RULES`, `htmlValidateMappedCheckIds`, `jsxA11yMappedCheckIds`,
> `APPLICABILITY_OBSERVABLE_CHECK_IDS`/`isApplicabilityObservableCheck`, `CHECK_IDS`,
> `domLocationDetails` all feed cross-check coverage tests
> (`check-registry.test.ts`, `catalog-coverage.test.ts`, `axe-map.test.ts`) that
> guarantee every check id has a real emitter and every analyzer a real check.
> Deleting them removes regression protection for the exact "silently missed
> check" failure mode the project prioritizes. Treat as keep, not dead — verified
> during implementation.

- [ ] `delete:` Remove test scaffolding shipping in prod — `playwright-page.ts` imports `vitest` (undeclared) + `layout-table-fixtures.ts`. `packages/analysis-core/src/runtime/custom-checks/playwright-page.ts:1-67` (~95 lines)
- [ ] `shrink:` Merge `pageEvaluateWithHitCapture`/`locatorEvaluateWithHitCapture` duplicate ~50-line bodies → one internal evaluator. `packages/analysis-core/src/runtime/custom-checks/hit-capture-evaluate.ts:42-145` (~40 lines)
- [ ] `shrink:` Hoist duplicated `backgroundRgb` into `MATH_PAYLOAD`. `packages/analysis-core/src/runtime/custom-checks/non-text-contrast.ts:139-150,225-236` (~12 lines)
- [ ] `delete:` Drop `isDismissalReason` + `DISMISSAL_REASONS` test-only. `packages/analysis-core/src/contract/finding-types.ts:162-169` (~8 lines)
- [ ] `delete:` Drop `truncateSnippet` + snippet-length constants (hardcoded literals anyway). `packages/analysis-core/src/runtime/dom-location.ts:13-31` (~8 lines)
- [ ] `delete:` Drop `parseRgb` dead, weaker dup of `parseCssColor`. `packages/analysis-core/src/runtime/custom-checks/non-text-contrast.ts:13-17` (~5 lines)
- [ ] `shrink:` `normalizeSnippet` renames `normalizeSnippetKey` → call directly. `packages/analysis-core/src/merge-findings.ts:69-71` (~3 lines)
- [ ] `yagni:` Drop `NamedElementConfig.hasName` never set. `packages/analysis-core/src/checks/families/names.ts:26,35` (~2 lines)
- [ ] `stdlib:` Replace `fast-glob` with `node:fs` `globSync` (engines already ≥22.22). `packages/analysis-core/src/source-files.ts:3,46-58` (-1 dep)
- [ ] `native:` Replace `linkinator` same-origin crawl with native `fetch` loop (anchors already enumerated, each URL already gated). `packages/analysis-core/src/runtime/site-level/link-check.ts:151-193` (-1 dep)

## src/server

- [ ] `shrink:` `maxCheckoutBytes`/`maxCheckoutFiles`/`maxCheckoutScanMs` single-use accessors → destructure `assessmentCheckoutQuota()` once. `src/server/assessment/repo-checkout.ts:27-37` (~6 lines)
- [ ] `delete:` Drop `RunAiFixOnCheckoutOptions.propose`/`scan`/`onError` test-only injection seams. `src/server/assessment/ai-fix.ts:45-52,88-117` (~8 lines)

## src/core, ai, components

- [x] ~~`yagni:` Inline `OrgSwitcher` + `ProjectSwitcher` into `workspace-context.tsx`~~ — won't do: named components mocked by name in `workspace-context.test.tsx`; inlining breaks the mock structure. `src/components/shell/org-switcher.tsx`, `project-switcher.tsx`
- [ ] `yagni:` Inline `ConnectProjectDialog` one production caller into `connect-project-panel.tsx`. `src/components/github/connect-project-dialog.tsx:1-48` (~40 lines)
- [ ] `shrink:` `report-tones.ts` five hand-listed derived records → one `mapTone(pick)` over `STATUS_TONE_STYLE`. `src/core/display/report-tones.ts:102-142` (~30 lines)
- [ ] `shrink:` `status.ts` eight near-identical display interfaces → shared `ToneDisplay`/`BadgeDisplay`/`SeverityDisplay`. `src/core/display/status.ts:21-281` (~28 lines)
- [x] `delete:` Drop `toCountMap` (only its own test). `src/core/assessment/assessment-helpers.ts` — done; trimmed its test block
- [ ] `delete:` Drop dead re-exports from `verified-fix.ts` barrel. `src/ai/verified-fix.ts:11-24` (~8 lines)
- [x] ~~`yagni:` `parseRequirementsQueryParam`/`parseEvidenceQueryParam` → `trimmedQuery`~~ — won't do: live callers in `requirements-view.ts`/`evidence-view.ts` (evidence calls it twice); inlining duplicates at 3 sites and churns 4 imports. `src/core/filter-params/requirements.ts`, `evidence.ts`
- [x] `delete:` Drop `formatDateTime` (only its own test; production uses `formatDateTimeWithZone`). `src/core/datetime.ts` — done; trimmed `datetime.test.ts`, kept `formatDateTimeValue`
- [x] ~~`delete:` Drop `assessmentJobsResponseSchema`~~ — won't do: named in `assessment-job-guard.ts` as the rejected zod alternative; it's the contract reference two test suites validate. `src/core/assessment/assessment-jobs.ts:61-63`
- [ ] `shrink:` `firstParam` → one-liner. `src/core/filter-params/params.ts:9-15` (~3 lines)

## e2e / scripts (minor)

- [ ] `yagni:` Drop `assessment-worker-drain.ts` `export main` + `isDirectRun()` — no test imports it. `scripts/assessment-worker-drain.ts:33,78-95` (~15 lines)
- [ ] `shrink:` Merge duplicated numeric-env parsing (`numeric` vs `positiveInt`) → one helper. `scripts/assessment-worker-drain.ts:26-31`, `operations-check.ts:21-30` (~10 lines)
- [ ] `shrink:` `parseAllowedDevOrigins` loop → `.split(",").map().filter(Boolean)`. `next.config.ts:13-26` (~10 lines)
- [ ] `shrink:` `resolveE2EDbUrl` fallback duplicates `playwright.config.ts` → one constant. `e2e/helpers.ts:58-65` (~4 lines)
- [ ] `shrink:` Playwright `owner` project 8-regex list → `testMatch` + `testIgnore`. `playwright.config.ts:61-68` (~2 lines)

---

net: ~-1,780 lines, -2 deps (fast-glob, linkinator), -3 scripts possible.

## Suggested order

1. Deletions with zero behavior change: per-route `error.tsx`/`loading.tsx`, unused `ui/` exports, test-only symbols.
2. `shrink:` merges (duplicate evaluators, duplicated predicates, display tables).
3. Dep swaps (`fast-glob`, `linkinator`) — verify against the full gate and runtime audit.

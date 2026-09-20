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

- [ ] `delete:` Drop `CheckRegistration.analyzers` + 133 per-check arrays — rule ownership already lives in `*-map.ts`; only the test reads it. `packages/analysis-core/src/check-registry.ts:49,59-897` (~134 lines)
- [ ] `delete:` Remove test scaffolding shipping in prod — `playwright-page.ts` imports `vitest` (undeclared) + `layout-table-fixtures.ts`. `packages/analysis-core/src/runtime/custom-checks/playwright-page.ts:1-67` (~95 lines)
- [ ] `delete:` Drop `a11y-model.ts` dead `isDisabled`/`tabIndexValue`/`explicitWidgetRole`/`implicitRoles`/`isFocusable` (test-only). `packages/analysis-core/src/a11y-model.ts:136-223` (~57 lines)
- [ ] `delete:` Drop `a11y-aria.ts` dead `isConcreteAriaRole`/`isAriaProperty`/`RequiredAriaProp`/`requiredAriaProps`/`nativeSatisfiesRole` + `roleDefinitions`/`ariaPropertyNames` tables. `packages/analysis-core/src/a11y-aria.ts:11-87` (~40 lines)
- [ ] `shrink:` Merge `pageEvaluateWithHitCapture`/`locatorEvaluateWithHitCapture` duplicate ~50-line bodies → one internal evaluator. `packages/analysis-core/src/runtime/custom-checks/hit-capture-evaluate.ts:42-145` (~40 lines)
- [ ] `delete:` Drop `CUSTOM_PROBE_CHECK_IDS` test-only → derive in the test. `packages/analysis-core/src/runtime/custom-checks/types.ts:21-52` (~33 lines)
- [ ] `delete:` Drop `domLocationDetails` test-only. `packages/analysis-core/src/contract/location.ts:63-78` (~17 lines)
- [ ] `delete:` Drop `APPLICABILITY_OBSERVABLE_CHECK_IDS` + set + `isApplicabilityObservableCheck` test-only. `packages/analysis-core/src/runtime/applicability.ts:41-54` (~14 lines)
- [ ] `delete:` Drop `REJECTED_AXE_RULES` + `axeMappedCheckIds` test-only. `packages/analysis-core/src/runtime/axe-map.ts:137-154` (~13 lines)
- [ ] `shrink:` Hoist duplicated `backgroundRgb` into `MATH_PAYLOAD`. `packages/analysis-core/src/runtime/custom-checks/non-text-contrast.ts:139-150,225-236` (~12 lines)
- [ ] `delete:` Drop `htmlValidateMappedCheckIds`/`jsxA11yMappedCheckIds` test-only → inline `Object.values(MAP)`. `packages/analysis-core/src/runtime/html-validate-map.ts:38-40`, `jsx-a11y-map.ts:51-53` (~9 lines)
- [ ] `delete:` Drop `isDismissalReason` + `DISMISSAL_REASONS` test-only. `packages/analysis-core/src/contract/finding-types.ts:162-169` (~8 lines)
- [ ] `delete:` Drop `truncateSnippet` + snippet-length constants (hardcoded literals anyway). `packages/analysis-core/src/runtime/dom-location.ts:13-31` (~8 lines)
- [ ] `delete:` Drop `parseRgb` dead, weaker dup of `parseCssColor`. `packages/analysis-core/src/runtime/custom-checks/non-text-contrast.ts:13-17` (~5 lines)
- [ ] `delete:` Drop `CHECK_IDS` test-only. `packages/analysis-core/src/check-registry.ts:902-904` (~3 lines)
- [ ] `shrink:` `normalizeSnippet` renames `normalizeSnippetKey` → call directly. `packages/analysis-core/src/merge-findings.ts:69-71` (~3 lines)
- [ ] `yagni:` Drop `NamedElementConfig.hasName` never set. `packages/analysis-core/src/checks/families/names.ts:26,35` (~2 lines)
- [ ] `stdlib:` Replace `fast-glob` with `node:fs` `globSync` (engines already ≥22.22). `packages/analysis-core/src/source-files.ts:3,46-58` (-1 dep)
- [ ] `native:` Replace `linkinator` same-origin crawl with native `fetch` loop (anchors already enumerated, each URL already gated). `packages/analysis-core/src/runtime/site-level/link-check.ts:151-193` (-1 dep)

## src/server

- [ ] `delete:` Drop env getters `aiGatewayApiKey`/`aiModel`/`appUrl`/`nodeEnv` (test-only; `src/ai` reads `process.env` directly). `src/server/env.ts:45-82` (~19 lines)
- [ ] `shrink:` `remediationEvidenceDetail` 8-key copy-if-defined → `Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined))`. `src/server/assessment/remediation-evidence.ts:19-41` (~17 lines)
- [ ] `shrink:` `githubOAuthConfigured`+`assertProductionGitHubAuth` re-implement `@/auth` guards → one shared predicate. `src/server/github/access-token.ts:19-42` (~22 lines)
- [ ] `delete:` `github-connector` pass-throughs `fetchRepo`/`createProjectPullRequest`/`listAvailableRepos` → re-export targets. `src/server/github/github-connector.ts:50-82` (~15 lines)
- [ ] `delete:` Drop `canManageOrgMembers` (0 callers) + `userRoleInOrg` (feeds only it/test). `src/server/workspace/org-queries.ts:51-57,104-112` (~11 lines)
- [ ] `delete:` Drop `getStoredGitHubToken` (0 callers; `...WithExpiry` used). `src/server/github/github-tokens.ts:112-117` (~6 lines)
- [ ] `delete:` Drop `reportAppError` pure delegate to `reportError`. `src/server/observability.ts:47-56` (~6 lines)
- [ ] `delete:` Drop `githubCloneUrl` test-only retention. `src/server/github/github.ts:101-105` (~5 lines)
- [ ] `shrink:` `redactCloneUrl` one-line delegate → call `redactSecrets` inline. `src/server/github/github.ts:118-126` (~5 lines)
- [ ] `shrink:` `cloneAuthedShallow` one-caller delegate → inline. `src/server/assessment/repo-checkout.ts:158-168` (~6 lines)
- [ ] `delete:` Drop `noGitHttpAuth` + `cloneShallow`'s never-omitted default `auth` param. `src/server/github/git-http.ts:23-26` (~5 lines)
- [ ] `shrink:` `maxCheckoutBytes`/`maxCheckoutFiles`/`maxCheckoutScanMs` single-use accessors → destructure `assessmentCheckoutQuota()` once. `src/server/assessment/repo-checkout.ts:27-37` (~6 lines)
- [ ] `delete:` Drop `RunAiFixOnCheckoutOptions.propose`/`scan`/`onError` test-only injection seams. `src/server/assessment/ai-fix.ts:45-52,88-117` (~8 lines)
- [ ] `shrink:` Second `isUniqueViolation` duplicates `packages/db/src/repo/orgs.ts` → share one. `src/server/assessment/assessment-jobs.ts:63-70` (~8 lines)
- [ ] `yagni:` Drop `runAssessmentJobBatch` `number | options` overload (tests only). `src/server/assessment/assessment-scheduler.ts:69-95` (~4 lines)
- [ ] `delete:` Drop redundant `appendEvidence`/`ProjectRows` re-export. `src/server/assessment/assessment-pipeline.ts:312` (~1 line)

## src/core, ai, components

- [ ] `yagni:` Inline `OrgSwitcher` + `ProjectSwitcher` one-caller adapters into `workspace-context.tsx`. `src/components/shell/org-switcher.tsx:1-29`, `project-switcher.tsx:1-31` (~50 lines)
- [ ] `yagni:` Inline `ConnectProjectDialog` one production caller into `connect-project-panel.tsx`. `src/components/github/connect-project-dialog.tsx:1-48` (~40 lines)
- [ ] `shrink:` `report-tones.ts` five hand-listed derived records → one `mapTone(pick)` over `STATUS_TONE_STYLE`. `src/core/display/report-tones.ts:102-142` (~30 lines)
- [ ] `shrink:` `status.ts` eight near-identical display interfaces → shared `ToneDisplay`/`BadgeDisplay`/`SeverityDisplay`. `src/core/display/status.ts:21-281` (~28 lines)
- [ ] `delete:` Drop `toCountMap` test-only. `src/core/assessment/assessment-helpers.ts:93-103` (~11 lines)
- [ ] `delete:` Drop dead re-exports from `verified-fix.ts` barrel. `src/ai/verified-fix.ts:11-24` (~8 lines)
- [ ] `yagni:` `parseRequirementsQueryParam`/`parseEvidenceQueryParam` alias wrappers → call `trimmedQuery`. `src/core/filter-params/requirements.ts:19-24`, `evidence.ts:38-43` (~8 lines)
- [ ] `delete:` Drop `formatDateTime` test-only. `src/core/datetime.ts:11-13` (~4 lines)
- [ ] `delete:` Drop `assessmentJobsResponseSchema` test-only. `src/core/assessment/assessment-jobs.ts:61-63` (~3 lines)
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

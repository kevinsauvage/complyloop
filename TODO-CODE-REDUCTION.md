# TODO — Code Reduction Audit

Goal: less code / less complexity / fewer abstractions / fewer files, same behavior.
Method: `graft map` + `graft ask --source` + targeted `grep`/`wc -l`/import checks. No code modified.

> Rule applied per item: "If this code did not exist today, would we need to introduce it?" If no → flagged.
> Boring, obvious code preferred. No clever one-liners. Domain boundaries, tests-as-spec, and load-bearing types are kept.

---

## P1 — Significant reduction

- [ ] **Unify reporting header/footer + single-pass evidence filter**
  - Why: `headerMarkdown:55-68` vs `reportShell:420-459` and `footerMarkdown:70-76` vs `reportShell:453-455` render the same header/footer twice (HTML vs md); truncation note `report-markdown.ts:242-247` vs `report-html/report.ts:143-145` and count tables `report-markdown.ts:78-90,102-113` vs `report-html/report.ts:169-174,32-45` duplicate; `reportInputForProject:100-122` filters evidence by `projectId:117` then `evidenceRowsForProject:151-164` filters + reverses again; `findings-queries.ts:8-10` is a 3-line `cache()` wrapper used once.
  - Where: `src/server/reporting/report.ts:41-156`, `report-model.ts:57-73,151-164,306-316`, `report-markdown.ts:55-260`, `report-html/primitives.ts:420-459`, `report-html/report.ts:28-205`, `findings-queries.ts:8-10` (caller `project-view.ts:142`), `evidence-queries.ts:16-46` vs `report.ts:125-156`.
  - Reduction: unify on `ReportHeaderModel:57-66` + `projectSourceLabel:69-73`; filter evidence once; inline `findings-queries.ts` at call site; route `loadReportInput` through `evidence-queries.ts` or vice versa. Keep HTML-vs-md renderers (parallel by design) and `FRAMEWORK_BY_PRESET`/`DISPLAY_CONTROLS` caches in `report.ts:41-88` (perf).
  - Risk: low / medium (snapshot tests: `report.test.ts`, `report-html/report.test.ts`, `report-model.test.ts`, `primitives.test.ts`)
  - Impact: ~65 LOC / 1 file / 1 double-filter removed

- [ ] **Fold tiny `analysis-core` contract/catalog/pattern/scan modules**
  - Why: several files exist for a single function/const with one caller: `contract/assessment-limits.ts:11` (`positiveEnv` + `maxRuntimePages`), `catalog/catalog-ids.ts:12` (`catalogControlIds`), `catalog/types.ts:23` (`FrameworkPreset` types), `catalog/rgaa/pertinence-twins.ts:18` (`PERTINENCE_TWIN_CONTROL_IDS` + 1 predicate), `analyzer-versions.ts:24` (2 one-line version wrappers), `jsx-a11y-fixes.ts:91` (sole caller `jsx-a11y-scan.ts:7,82`), `patterns/error-prevention-criteria.ts:26` + `object-recognition-captcha.ts:43` (re-export chains into `multilingual.ts`/`captcha-config.ts`).
  - Where: fold `assessment-limits.ts` → `contract/assessment-jobs.ts`; `catalog-ids.ts` + `catalog/types.ts` → `catalog/catalog.ts` / `catalog/registry.ts`; `pertinence-twins.ts` → `wcag/presets.ts` or `rgaa/presets.ts`; `analyzer-versions.ts` → `runtime/scan.ts` or `runtime/axe-map.ts` / `html-validate-runtime.ts`; `jsx-a11y-fixes.ts` → `jsx-a11y-scan.ts`; `patterns/` 4 files → 2 (`captcha-config` + `multilingual`). Keep `statuses.ts:43`, `requirement-status.ts:119`, `entities.ts:239`/`finding-types.ts:178`/`project-types.ts:107` split (cycle-free, documented at `entities.ts:21-27`), `check-registry.ts:895` as single registration point, `fixes.ts:48` (tight, engine-agnostic).
  - Reduction: moves, not logic changes; delete file headers + re-exports + duplicate `PUZZLE_HOST_NAMES` re-export (`multilingual.ts:56-59` vs `object-recognition-captcha.ts:13`).
  - Risk: low (pure data accessors; pins: `catalog-coverage.test.ts`, `registry.test.ts`, `captcha-config.test.ts`, `multilingual.test.ts`)
  - Impact: ~75 LOC / ~7 files / ~6 single-purpose modules removed

- [ ] **Merge `check-authority.ts` into `check-registry.ts`, fold `jsx-primitives.ts` + `checks/jsx-text-walk.ts` into `parse.ts`**
  - Why: `check-authority.ts:112` is 6 registry-derived classifiers + `REGISTRY_BY_ID:15-20` + `entryFor:19-20` indirection over `CHECK_REGISTRY` — merging into `check-registry.ts:895` deletes the indirection. `jsx-primitives.ts:31` (`isPropSpreadingHost`, `hasAriaName`) is imported by every family but belongs next to `getAttribute`/`hasAnyAttr` in `parse.ts:83-130`. `checks/jsx-text-walk.ts:41` (`hasAttrOnAncestors`, `collectJsxTexts`) duplicates the ancestor-walk shape of `isInsideNamingHost` in `heuristic-utils.ts:258-271`. Note: correct path is `src/checks/jsx-text-walk.ts`, not `src/jsx-text-walk.ts`.
  - Where: `packages/analysis-core/src/check-authority.ts:9-112` → `check-registry.ts:1-143`; `packages/analysis-core/src/jsx-primitives.ts:1-31` → `parse.ts:83-130` (callers: `families/forms.ts`, `structure.ts`, `motion.ts`, `names.ts`); `packages/analysis-core/src/checks/jsx-text-walk.ts:1-41` → `parse.ts` or `heuristic-utils.ts`.
  - Reduction: ~20 LOC authority indirection + ~70 LOC file/import boilerplate; derive one text predicate (`hasTextContent` in `parse.ts:197-215` vs `textContentOf` in `heuristic-utils.ts:162-170` — currently used side-by-side in `forms.ts:378` vs `:537,589,635,907`).
  - Risk: low / medium (move `check-authority.test.ts:206` pins together; do not touch `a11y-model.ts:31-69` aria-query tables, only thin wrappers)
  - Impact: ~90 LOC boilerplate / 3 files / 2 indirections removed

- [ ] **Delete dead helpers in `heuristic-utils.ts`, un-export single-file transcript chain**
  - Why: `handlerTriggersContextChange:40-57` has zero family users (only its own test); `DESCRIPTION_KINDS:92` is internal-only; `tagNodeOfJsxChild:98-102` (1 caller in `forms.ts`) and `isDataTable:186-190` (1 caller in `structure.ts:472`) are trivial type-narrows; `nextMeaningfulSibling:287-309` → `hasAdjacentTagMatching:311-318` → `hasAdjacentTranscriptLink:320-333` + `ariaDescribedByPointsToTranscript:335-370` → `hasTrackOrTranscriptAlt:373-381` is a private chain with exactly 1 external caller (`media.ts`) currently over-exported. File header `heuristic-utils.ts:15-21` "BLAST RADIUS… do not split" enforces grab-bag status — replace with per-helper ownership if split later. Keep hot `textContentOf:162-170` + `descendantTags:173-183` (5–6 families each).
  - Where: `packages/analysis-core/src/checks/heuristic-utils.ts:1-417`, `packages/analysis-core/src/checks/heuristic-utils.test.ts:295`.
  - Reduction: delete dead helper + test block; inline 2 trivial helpers; make transcript chain non-exported.
  - Risk: low (dead-code deletion; medium only if splitting hot helpers — needs full `src/checks/` suite)
  - Impact: ~35 LOC / 0 files / 4 exports removed

- [ ] **Route hand-rolled `new Function` probes through `pageEvaluateWithHitCapture`, merge Playwright infra files**
  - Why: `supplementary-content-keyboard.ts:12-16` and `widget-keyboard.ts:20-24` hand-roll `new Function(\`return (${helperSrc})\`)`with own`BROWSER_HELPERS`instead of using the wrapper;`playwright-page.ts:50`+`with-emulated-media.ts:21`(71 LOC total) are both test/probe infra;`page-restore.ts:17`is 1 function called from`index.ts`orchestration;`widget-keyboard-utils.ts:39` name lies (`selectorOf`/`selectorRef`used by ~20 probes, not just widget-keyboard);`layout-table-fixtures.ts:28` is test-only living in prod tree.
  - Where: `packages/analysis-core/src/runtime/custom-checks/supplementary-content-keyboard.ts`, `widget-keyboard.ts:177`, `playwright-page.ts:50`, `with-emulated-media.ts:21`, `page-restore.ts:17` → `index.ts:201`, `widget-keyboard-utils.ts:39` (rename to `dom-selectors.ts` or merge `selectorOf` into `hit-capture.ts`), `layout-table-fixtures.ts:28` → `layout-table-linearization.test.ts:59` or `*.test-utils.ts`.
  - Reduction: reuse wrapper (~20 LOC), merge infra (~10 LOC), fold `page-restore` (~5 LOC + 1 file), move fixtures out of prod tree (~28 LOC surface).
  - Risk: low (infra/test-only) except CSP/`new Function` constraints documented in `hit-capture.ts:60-70` — do not merge browser-string sources.
  - Impact: ~45 LOC + fixtures surface / 1–2 files

- [ ] **Inline single-use UI primitives, merge copy-button/code-block, trim page-primitives**
  - Why: per `AGENTS.md` dependency policy (2+ consumers per primitive), 5 `ui/` wrappers violate it — verified single-prod-use: `table` → only `org-members-card.tsx:13`, `separator` → only `app-shell.tsx:10`, `avatar` → only `auth-controls.tsx:6`, `sheet` → only `mobile-nav-sheet.tsx:14`, `sonner` (`Toaster`) → only `app/layout.tsx:7`. Separately: `badge-with-description.tsx:11-31` used only in `badges.tsx:54,68`; `CodeBlock:37-49` reimplements copy button instead of reusing `CopyButton` (double `aria-live` across `copy-button.tsx:22-24` + `code-block.tsx:34-36` + `use-copy.ts:22,26`); `PageActionLink:217-229` used once (`:208` in `NoProjectNotice`), `MetaTile:231-250` used 4× but all in `org-account-overview.tsx:80,84,93,120`.
  - Where: `src/components/ui/table.tsx`, `separator.tsx`, `avatar.tsx`, `sheet.tsx`, `sonner.tsx`; `src/components/badge-with-description.tsx:11-34` → `badges.tsx`; `src/components/copy-button.tsx:6-27` + `code-block.tsx:10-79` (consumers `developer-handoff.tsx:35,48,58,73,84`); `src/components/page-primitives.tsx:18-250` (`PageActionLink`, `MetaTile`; keep `PageHeader/PageSection/PageContent/EmptyState`). Keep `avatar/sheet/sonner` behavior (a11y/focus), `pathname-focus.tsx:6-18` as separate client leaf (server/client rule), `filter-chip-list.tsx`, `form-classes.ts:1-3`, `stateful-action-form.tsx:16-80` (5×), `auto-submit-select-form.tsx` (2×).
  - Reduction: `separator` → `<div role="separator">`; `table` → native `<table>` + classes (only if ARIA/focus preserved); `CodeBlock` reuses `CopyButton`; inline `PageActionLink`, move `MetaTile` to owner file.
  - Risk: medium (Radix a11y/focus) / low (badge, copy-button, page-primitives inlines)
  - Impact: ~75–175 LOC / 2–3 files (realistic: ~30 LOC separator + ~80 LOC table + ~31 LOC badge + ~15 LOC copy merge + ~12–30 LOC page-primitives)

- [ ] **Apply assessment micro-dedups (counts, failure evidence, inline drain, AI onError)**
  - Why: `openViolationCount` + `failedRequirementCount` duplicate `countByStatus` (used `assessment.ts:415`, `report-model.ts:306,316`); failure-evidence preamble `assessment-pipeline.ts:249-287` duplicates apply lock/insert `:201-241` while `withProjectLock:202-212` exists unused; `assessment-job-inline.ts:39-53` message branches + `assessment.ts(action):50-57` branch on `shouldDrainAssessmentJobsInline:10-12` double-handles dev/e2e drain; `onError:(e,r)=>reportError(e,r)` repeated in `actions/remediation-ai.ts:38,86` + `assessment/ai-fix.ts:90`.
  - Where: `src/server/assessment/assessment-worker.ts:23-34`, `assessment-pipeline.ts:109-119,186-287` (keep `snapshotPipelineSlice` narrowing + `runAssessment` 8-stage pure `assessment.ts:227-458` + `assessment-jobs.ts:101-407` queue + `assessment-runner.ts:41-72` batch loop + `assessment-job-inline.ts:10-53` — distinct layers, do not collapse), `assessment.ts(action):50-57`, `src/server/actions/remediation-ai.ts:38,86`.
  - Reduction: replace counts with `countByStatus`; use `withProjectLock` for failure path; return `ActionState` directly from drain helper; hoist `aiOnError` const.
  - Risk: low
  - Impact: ~40 LOC / 0 files

- [ ] **Unify `packages/db` test fixtures + `scripts/`/`e2e/` DB-url/client helpers + Playwright test harness**
  - Why: two parallel fixture graphs (`constraints.test.ts:164-231` raw SQL vs `test-fixtures/project-slice-fixture.ts:33-199`) + test-only `loadProjectSlice:201-229` fork of production `loadProjectRuntime:67-96` that will drift; `slicePayload:33-51` 19-line adapter + single-use `sliceFingerprint:231-233`; `e2e/helpers.ts:58-65` `resolveE2EDbUrl` re-implements `scripts/db.ts:24-32` `requireDatabaseUrl`; `e2e/webhook-helpers.ts:15-24` `withDb` opens raw `postgres(url,{max:3})` instead of `openScriptClient`; ~25 runtime tests repeat 5 imports + ~8 LOC harness (`registerPlaywrightBrowserTeardown` + `withPlaywrightPage` + `try/finally close` + `skipIf(!chromiumExecutableAvailable())`); 2 misnamed test pairs target the same source (`reflow-exceptions.test.ts:28` → `./reflow`, `non-text-contrast-states.test.ts:79` → `./non-text-contrast`).
  - Where: `packages/db/src/constraints.test.ts`, `test-fixtures/project-slice-fixture.ts`, `persist-project-rows.integration.test.ts:33-51,135,146`, `packages/db/src/workspace-load.ts:67-96`, `scripts/db.ts:16-40`, `scripts/env.ts:9-11`, `e2e/helpers.ts:58-65`, `e2e/webhook-helpers.ts:11-24`, `e2e/auth.ts:21` (pure re-export), `e2e/global-setup.ts:1-5`, `packages/analysis-core/src/runtime/custom-checks/playwright-page.ts:50` (home for shared `runProbe(html, fn)`), `reflow-exceptions.test.ts`, `non-text-contrast-states.test.ts`, `layout-table-fixtures.ts:28`.
  - Reduction: `constraints.test.ts` reuses `insertProjectSliceFixture`; `loadProjectSlice` delegates to `loadProjectRuntime`; unify to one `requireDbUrl({allowE2EOverride})`; `withDb` → `openScriptClient`; drop `auth.ts:21` re-export; inline `global-setup.ts` into `playwright.config.ts:46`; shared `runProbe`; fold 2 test pairs; move fixtures to `*.test-utils.ts`. Do NOT merge `truncateAll` (`e2e-seed.ts:23-45`) with `db-reset.ts:33-42` (intentionally different: fast truncate vs migration replay).
  - Risk: low (test-only) / medium (`constraints.test.ts` needs minimal `'{}'::jsonb` + FK-violation cases — keep raw-SQL path if speed matters)
  - Impact: ~340–390 LOC (fixtures ~100–130 + e2e scripts ~40–60 + harness ~200) / 3–4 files

## P2 — Minor reduction

- [ ] **Remove `src/server/action-state.ts:12-17` re-export after caller migration; fix 1 wrong import**
  - Why: `src/core/action-state.ts:1-25` (client-safe type + `initialActionState` + `unexpectedActionMessage`) vs `src/server/action-state.ts:1-44` (`server-only` + `reportError` + `publicErrorMessage` + `runAction`) split is required — but server module re-exports the 3 core names so old imports keep working. Caller map verified: `@/core/action-state` in `hooks/use-action-toast.ts:6`, `stateful-action-form.tsx:8`, `create-org-form.tsx:8`, `invite-member-form.tsx:9`, `create-pr-form.tsx:6`, `org-data-lifecycle.tsx:27`, `use-github-repo-connect.ts:5`; `@/server/action-state` in all `server/actions/*.ts` + `app/api/github/repos/route.ts:4` + `connect-project-panel.tsx:10`. One wrong import: `stateful-action-form.test.tsx:5` imports type from `@/server/action-state` while the component uses `@/core`.
  - Reduction: migrate callers to `@/core/action-state`, delete 6-line re-export block, fix test import.
  - Risk: low
  - Impact: ~6 LOC + 1 import fix / 0 files

- [ ] **Unify GitHub prod-gate + delete legacy clone URL**
  - Why: `access-token.ts:20-26` `githubOAuthConfigured` admits it copies auth-root `isGitHubAuthConfigured` (`:18-19`); `assertProductionGitHubAuth:32-41` vs `github-app.ts:41-56` `assertProductionGitHubApp` double-gate; `github.ts:96-100` `githubCloneUrl` retained "for existing tests only" (`:102-106`) vs `githubPublicCloneUrl:107-110` + `redactCloneUrl:118-120`.
  - Where: `src/server/github/access-token.ts:18-41`, `src/server/github/github-app.ts:41-56`, `src/server/github/github.ts:96-120`.
  - Reduction: one `isGitHubConfigured` export; delete legacy URL + update tests.
  - Risk: low
  - Impact: ~30 LOC / 0 files

- [ ] **Extract shared `projectIdFormSchema` / `orgMembershipFormSchema`; hoist `runtimeOnlyCount`**
  - Why: `src/core/validate.ts:1-114` already centralizes (`entityIdSchema`, `parseForm`, `firstIssueMessage`, "domain schemas live next to owners" at `:7-11`) — every action is already 1-line `parseForm(schema,formData)` (55 matches). Only micro-dups: `connect.ts:38-40` vs `:54-58` (both `{projectId: entityId}`), `org.ts:45-47` vs `:61+` membership shapes; `run-check.ts:71-76` recomputes `CHECK_REGISTRY.filter(isRuntimeOnlyCheck).length` per invocation.
  - Where: `src/server/actions/connect.ts:38-58`, `src/server/actions/org.ts:45-61`, `packages/check/src/run-check.ts:71-76` → module const.
  - Reduction: 2 shared schemas; hoisted const. Do not over-centralize per-action `z.object` literals (error-message specificity via `firstIssueMessage` relies on them).
  - Risk: low
  - Impact: ~10–15 LOC / 0 files

- [ ] **Drop 2 trivial `useMemo`s + 1 mount-flag effect**
  - Why: `create-pr-form.tsx:21-32` memoizes an object whose identity is irrelevant; `github-repo-picker.tsx:33-36` memoizes a cheap <100-row group-by; `theme-toggle.tsx:15-19` `mounted` flag only gates `aria-pressed` (CSS `dark:` variants already render both icons). Rest of `useEffect`/`useCallback` (26 matches) is load-bearing (fetch dedup, toasts, focus, polling).
  - Where: `src/components/create-pr-form.tsx:3,21-32`, `src/components/github-repo-picker.tsx:3,33-36`, `src/components/theme-toggle.tsx:15-19`. Keep `use-github-repo-search.ts:49,112,124`, `org-data-lifecycle.tsx:55`, `confirm-submit-button.tsx:70`, `finding-queue-nav.tsx:55`, `assessment-job-status-live.tsx:30`.
  - Reduction: plain consts; `suppressHydrationWarning` or CSS-only toggle.
  - Risk: low (verify no referential-stability consumer — none found)
  - Impact: ~15–20 LOC / 0 files

- [ ] **Collapse Playwright `chrome(state)` helper + `reportInfo`/`reportDebug` twins**
  - Why: `playwright.config.ts:54-80` repeats `devices["Desktop Chrome"] + storageState` across 3 projects (`public/owner/viewer`); `observability.ts:93-102` `reportInfo`/`reportDebug` are 10-line dev-only console gates; `use-action-toast.ts:13-16` + `sonner.tsx:10-14` `useTheme` coupling can be `theme="system"`.
  - Where: `playwright.config.ts:54-80`, `src/server/observability.ts:93-102`, `src/components/ui/sonner.tsx:1-48`, `src/hooks/use-action-toast.ts:1-64`. Keep `observability.ts:44-81` redaction + Sentry scoping (secret safety), `init.ts:1-22` 3-runtime sharing, `useActionToast:43-63` pending-flip dedup.
  - Reduction: `chrome(state)` helper; single `reportLog(level)`; `theme="system"`.
  - Risk: low
  - Impact: ~20–30 LOC / 0 files

- [ ] **Unify e2e secret resolvers + drop pure re-export/delegation files**
  - Why: `e2e/env.ts:7-9` `resolveE2EAuthSecret` vs `e2e/webhook-helpers.ts:11-13` `resolveWebhookSecret` share the same `process.env.X?.trim() || "fallback"` shape; `e2e/auth.ts:21` is a pure re-export of `./helpers`; `e2e/global-setup.ts:1-5` only delegates to `writeAuthStates()`.
  - Where: `e2e/env.ts:7-9`, `e2e/webhook-helpers.ts:11-13` → `resolveSecret(name, fallback)`; `e2e/auth.ts:21` → import `./helpers` directly; `e2e/global-setup.ts:1-5` → `playwright.config.ts:46`.
  - Reduction: delete 2 delegation layers.
  - Risk: low
  - Impact: ~10–15 LOC / 2 files

## P3 — Optional

- [ ] **Aggressive dependency-surface cuts (only with UX sign-off)**
  - Why: remaining wrappers are load-bearing for a11y/styling/persistence: custom `Toaster` (`ui/sonner.tsx:1-48`, icons + CSS vars), `ThemeToggle` + `ThemeProvider` (`theme-toggle.tsx:1-42`, `app/layout.tsx:5`), Sentry `init.ts:1-22` + 3 one-line `Sentry.init` sites + `next.config.ts:67-77` `withSentryConfig`. Deleting saves lines but degrades UX (custom icons, persisted theme override, server/edge/browser error scoping).
  - Where: `src/components/ui/sonner.tsx`, `src/components/theme-toggle.tsx`, `src/sentry/init.ts`, `sentry.server.config.ts:5`, `sentry.edge.config.ts:5`, `instrumentation-client.ts:15-26`.
  - Reduction: delete custom Sonner wrapper (~48 LOC), remove `next-themes` (~50 LOC + dep, replace with `prefers-color-scheme` CSS + cookie), inline Sentry init (~10 LOC).
  - Risk: medium / high (UX + observability cost)
  - Impact: ~90–110 LOC / 0–1 deps

- [ ] **Trim `packages/check` process-boundary boilerplate (marginal)**
  - Why: already thin and testability-preserving: `src/check.ts:1-18` (pure `runCheck(argv,io):number` must stay separable), `bin.js:1-20` (`existsSync(dist/cli.js)` guard required for published UX), `scripts/build.mjs:1-35` (deriving externals from `package.json:17-23` prevents drift). Only safe trims: custom bin message (~5 LOC), header comments.
  - Where: `packages/check/src/check.ts`, `packages/check/bin.js`, `packages/check/scripts/build.mjs`, `packages/check/src/run-check.ts:71-76` (covered in P2 hoist).
  - Reduction: trim messages/comments only; do not merge `check.ts`/`bin.js`/`build.mjs` (breaks `bin` contract in `package.json:5-7`).
  - Risk: low (trims) / medium-high (merges — do not do)
  - Impact: ~5–10 LOC / 0 files

- [ ] **Fold vitest smoke config into main config (marginal, risky)**
  - Why: `vitest.smoke.config.mts:1-13` duplicates `resolve.tsconfigPaths + environment:node` from `vitest.config.mts:1-121`, but isolation (120s timeout + pack rebuild) is intentional. Same for `eslint.config.mjs:8-26` repetition (flat-config requirement) and `next.config.ts:10-23` `parseAllowedDevOrigins` (normalization is load-bearing) and coverage `exclude:47-91` (documents ownership).
  - Reduction: `projects:[…]` entry or `--config` override; saves ~10 lines at cost of main-config complexity.
  - Risk: medium (risks running 120s pack test in default `npm test`)
  - Impact: ~10 LOC / 1 file — probably not worth it

# TODO — Code Reduction Audit

> Goal: less code, less complexity, fewer abstractions/files/dependencies — same behavior.
> Method: `graft map` + `graft ask` + `graft grep` + `graft callers` + `graft skeleton`, then source-file verification. No code modified.
> Principle applied throughout: _"If this code did not exist today, would we need to introduce it?"_ If no, it is flagged below.

---

## P0 — Major reduction

- [x] **Unify `withProjectWrite` / `withFindingWrite` (near-duplicate write pipeline)**
  - > **Done 2026-09-17 (partial, deliberate):** shared commit tail extracted as `commitLockedProjectPayload()` (~30 lines deduped); `withProjectWrite`/`withFindingWrite` keep distinct lock-resolution paths (cookie-probe + stale-guard vs finding-preview — full unification judged too risky for the locking protocol). `withProjectLock` re-export hop deleted (`alerts.ts` imports from `workspace/db.ts`). `withOrgWrite`/`withConnectWrite` already share `withLockedTenancy` — left as-is.
  - Why: two ~70-line functions in the same file do lock → load → snapshot → `fn()` → `stampEvidenceActor` → `persistProjectRows`. Only the lock-target resolution differs (cookie project vs finding's project). Same for `withOrgWrite` / `withConnectWrite` sharing `withLockedTenancy` + near-identical persist loops.
  - Where: `src/server/workspace/workspace-write.ts:72-143` (`withProjectWrite`), `src/server/workspace/workspace-write.ts:146-200` (`withFindingWrite`), `src/server/workspace/workspace-write.ts:217-322` (`withLockedTenancy`, `withOrgWrite`, `withConnectWrite`)
  - Reduction: one `withLockedProjectWrite({ projectId | findingId }, fn)` + one tenancy-write helper; keep `withProjectLock` re-export in `src/server/workspace/db.ts` instead of re-exporting through `workspace-write.ts:203`.
  - Risk: medium (locking + stale-slice guards need tests: `src/server/workspace/workspace.test.ts`, `packages/db/src/*`)
  - Impact: ~120–150 LOC / 1 file / 2–3 abstractions removed

- [ ] **Collapse runtime custom-check probe sprawl into fewer modules**
  - Why: ~25 one-violation files (`focus.ts` 479 lines being the outlier, most 100–260 lines) + `index.ts` (278 lines: `findingsFromCustomViolations`, `runProbe` + 60s timeout race, `quiescePageForProbe`, `runCustomRuntimeChecks`, `runThemeSensitiveCustomChecks`) + support layers `hit-capture.ts`, `hit-capture-evaluate.ts`, `playwright-page.ts` (`withProbePage`, `registerPlaywrightBrowserTeardown` — top hubs with 25–29 callers), `page-restore.ts`, `with-emulated-media.ts`, `widget-keyboard-utils.ts`, `hover-reveal.ts`, `form-submit-probe.ts`, `visually-hidden.ts`, `dom-hit-rich.ts`, `layout-table-fixtures.ts`. Each probe repeats evaluate → capture → `CustomViolation` shaping. Verified via `graft map` (110 files / 298 symbols in `runtime/`) and `graft skeleton packages/analysis-core/src/runtime/custom-checks/index.ts`.
  - Where: `packages/analysis-core/src/runtime/custom-checks/*.ts` (esp. `index.ts:37-278`, `focus.ts:139-201`, `form-error-submit.ts:22-123`), `packages/analysis-core/src/runtime/dom-location.ts`, `packages/analysis-core/src/runtime/raw-finding-from-dom.ts`
  - Reduction: one `probes/` table (`{ id, run(page): Promise<CustomViolation[]> }`) + single harness (`runProbe` + quiesce + restore); merge `hit-capture*` + `playwright-page.ts` into harness; merge tiny probes by theme (keyboard, forms, media, contrast, tables); delete fixture-only modules or move fixtures into tests.
  - Risk: medium (runtime behavior must stay identical; keep `index.test.ts`, `custom-checks.test.ts` green)
  - Impact: ~800–1200 LOC / ~15–20 files / 1 orchestration abstraction removed

- [ ] **Merge report stack: model + markdown + HTML + loader + caches**
  - Why: same `ReportInput` is rendered twice (string-templated HTML in `report-html/report.ts` 205 lines + `report-html/primitives.ts` 459 lines, markdown in `report-markdown.ts` 270 lines) from the same model in `report-model.ts` (331 lines: `composeEngineeringReport`, `composeAuditReport`, `toEngineeringFindingCard`, `toAuditRequirementRow`, `evidenceRowsForProject`, `indexBy`, `languageForLocation`). `report.ts` (154 lines) adds three module-level caches (`CONTROLS_BY_ID`, `FRAMEWORK_BY_PRESET`, `DISPLAY_CONTROLS`) + `frameworkForProject` + `displayControl` + `reportInputForProject` + `loadReportInput` for what is static catalog data + one query. `graft callers frameworkForProject/displayControl` shows only 3–5 callers each — cache buys nothing measurable.
  - Where: `src/server/reporting/report.ts:41-154`, `src/server/reporting/report-model.ts:42-331`, `src/server/reporting/report-markdown.ts`, `src/server/reporting/report-html/report.ts`, `src/server/reporting/report-html/primitives.ts:420-459`
  - Reduction: keep one model builder; render HTML from markdown (or share row/card helpers); delete hand-rolled caches (replace with direct `presetById`/`shippedCatalog` lookup or single lazy `Map`); fold `loadReportInput` into the two export routes that use it.
  - Risk: medium (report output is an audit artifact — snapshot-test before/after)
  - Impact: ~400–600 LOC / 2–3 files / 2 cache abstractions removed

- [ ] **Collapse display-tone/status/badge tower**
  - Why: `report-tones.ts` (147 lines: `STATUS_TONE_STYLE` + 5 derived `Record` maps + `toneStyle`/`requiredReport`/`requiredReportClass` via `mustGet`) + `status.ts` (351 lines: 10+ `*Display` interfaces + tables, each via `mustGet`) + `evidence.ts` (103 lines) + `must-get.ts` (11 lines) + `display.ts` barrel (47 lines re-exporting everything) + `badges.tsx` (176 lines: 7 near-identical `*Badge` wrappers around `StatusBadge`) + `badge-with-description.tsx` (31 lines: Tooltip wrapper used almost exclusively by `StatusBadge`). `graft callers mustGet` = 14 thin wrappers doing `Record[key] ?? throw`. This is a lookup table wearing four layers.
  - Where: `src/core/display/report-tones.ts`, `src/core/display/status.ts`, `src/core/display/evidence.ts`, `src/core/display/must-get.ts`, `src/core/display.ts`, `src/components/badges.tsx:38-176`, `src/components/badge-with-description.tsx:11-31`
  - Reduction: single `status-display.ts` with plain `Record` + direct index (or `?? throw` inline — delete `mustGet`); delete barrel re-exports; replace 7 badge wrappers with one `<StatusBadge display={…}>` call site or a tiny map; inline `BadgeWithDescription` into `StatusBadge` (only other callers are 2 spots in `findings/[id]/page.tsx:100-110` — use `StatusBadge` there).
  - Risk: low (pure UI tables; `src/core/display.test.ts`, `badges.test.tsx` cover it)
  - Impact: ~350–450 LOC / 4–5 files / 2 abstractions removed (`mustGet`, barrel layer)

- [ ] **Collapse server-action wrapper chain (`runAction` → `runFinding/ProjectAction` → `refresh` + guards)**
  - > **Decided 2026-09-17: keep `define-action.ts`.** Only 6 call sites (not "most actions would be shorter inlined" — deleting expands every site for ~40 lines saved). Done instead: `requireFindingContext` deleted (zero callers), `ActionState` import canonicalized on `@/core/action-state` (25 files). `COMPLIANCE_LOOP_ROUTES` kept (6 direct importers).
  - Why: every mutation is `runAction(async () => { parse…; await with…Write(…); refresh(…); return message })`. `runAction` (`src/server/action-state.ts:29-41`) + `runFindingAction`/`runProjectAction` (`src/server/actions/define-action.ts:24-54`) + `refresh` (`src/server/actions/shared.ts:35-41`, thin `revalidatePath` loop) + `COMPLIANCE_LOOP_ROUTES` (`src/server/actions/refresh-routes.ts`) + guard trio `requireOnActive`/`requireOnFindingProject`/`requireFindingContext` (`shared.ts:50-81`, the last is a 2-line wrapper returning its inputs). Most actions would be shorter inlined.
  - Where: `src/server/action-state.ts`, `src/server/actions/define-action.ts`, `src/server/actions/shared.ts`, `src/server/actions/refresh-routes.ts`, callers in `src/server/actions/*.ts` (~15 files)
  - Reduction: delete `define-action.ts`; call `runAction` + `with…Write` + `refresh` directly (or a single `mutateProject(message, routes, fn)` only where the 3-line pattern repeats verbatim); delete `requireFindingContext` (use `requireOnFindingProject` return); inline single-use route lists.
  - Risk: low (mechanical; action tests in `src/server/actions/*.test.ts` cover mapping)
  - Impact: ~120–180 LOC / 2 files / 2 wrapper layers removed

## P1 — Significant reduction

- [ ] **Merge client/server error-reporting trio + delete demo page**
  - Why: `src/server/observability.ts` (112 lines: `reportError`/`reportWarning`/`reportInfo`/`reportDebug`/`reportEvent`/`reportAppError` + `applyReportContext`/`redactError`/`isProduction`) vs `src/lib/report-client-error.ts` (27 lines: same Sentry `withScope` shape, created only because server module pulled `node:*` into the client) vs `src/components/reported-error.tsx` (45 lines: `useEffect` → `reportClientError` → `<AppErrorCard>`) vs `src/components/app-error-card.tsx` (109 lines). Plus `src/app/error.tsx` + `src/app/global-error.tsx` both rendering `ReportedError`, and `src/app/sentry-example-page/page.tsx` (237 lines, 0 callers per `graft grep sentry-example-page`) shipping a demo to production.
  - Where: `src/server/observability.ts`, `src/lib/report-client-error.ts`, `src/components/reported-error.tsx`, `src/components/app-error-card.tsx`, `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/sentry-example-page/page.tsx`, `src/server/redact.ts:1-26`
  - Reduction: delete `sentry-example-page/`; keep one server reporter + one 10-line client reporter (or import `reportAppError` from a client-safe module); fold `ReportedError` into `AppErrorCard` (the `useEffect` report is 3 lines); drop unused levels (`reportDebug`/`reportInfo`/`reportEvent` → `console.*` at call sites or delete).
  - Risk: low
  - Impact: ~300–400 LOC / 3–4 files / 1 reporting abstraction removed

- [ ] **Simplify form stack (`StatefulActionForm` + `ConfirmSubmitButton` + toasts + ancillary fields)**
  - Why: `stateful-action-form.tsx` (115 lines: `useActionState` + `useActionToast` + `RefreshOnSuccess` router-refresh workaround + retry-label + inline `role=status/alert` copy) + `confirm-submit-button.tsx` (130 lines: `resolveSubmitLabel` + `wasPending` ref + `useEffect` dialog-close + dual plain/confirm branches) + `use-action-toast.ts` (64 lines: `announceResult` 3-line `sonner` wrapper + `useActionToast` with `wasPending` ref + 6-dep `useEffect`) + `auto-submit-select-form.tsx` (102 lines, own `SwitchButton` + `useFormStatus`) + `reason-note-fields.tsx` + `findings/dismiss-finding-fields.tsx` (same note/reason inputs twice) + `form-classes.ts` (3 lines: one select class string). Three separate `wasPending`/`pending` trackers for one concept.
  - Where: `src/components/stateful-action-form.tsx`, `src/components/confirm-submit-button.tsx`, `src/hooks/use-action-toast.ts` (+ `announceResult` callers via `use-copy.ts`), `src/components/auto-submit-select-form.tsx`, `src/components/reason-note-fields.tsx`, `src/components/findings/dismiss-finding-fields.tsx`, `src/components/form-classes.ts`
  - Reduction: one `ActionForm` (form + submit + inline message; confirm as optional prop rendered inline, not a separate component file); single toast helper (delete `announceResult`, call `toast.success/error` directly); merge the two note-field components; inline `nativeSelectClass` (2 callers) or keep one `form-classes` only if 3+ consumers.
  - Risk: low–medium (touches every mutation form; keep `stateful-action-form.test.tsx`, `confirm-submit-button.test.tsx` green)
  - Impact: ~200–300 LOC / 2–3 files / 1–2 wrappers removed

- [ ] **Merge micro-barrels and 10-line helper modules**
  - Why: `src/core/display.ts` (47 lines, pure re-export), `src/core/filter-params.ts` (56 lines, pure re-export), `src/core/filter-params/href.ts` (12 lines: `href()`), `src/core/filter-params/params.ts` (26 lines: `firstParam`/`trimmedQuery`), `src/core/display/must-get.ts` (11 lines), `src/components/form-classes.ts` (3 lines), `src/components/dashboard/project-description.ts` (24 lines), `src/components/findings/finding-list-items.ts` (31 lines: one `map`), `src/components/filter-chip-list.tsx:6-14` (`filterChipClass` used in 2 files). Each is cheaper inline or folded into its only consumer. Verified via `graft skeleton` + `graft grep filterChipClass` (2 hits).
  - Where: files listed above + `src/core/filter-params/pagination.ts:1-65`, `src/core/filter-params/requirements.ts:1-55`, `src/core/filter-params/evidence.ts`
  - Reduction: fold `href`+`params`+`pagination` into one `filter-params/query.ts`; delete both barrel files (import from source modules); inline `mustGet`, `nativeSelectClass`, `project-description.ts`, `finding-list-items.ts` (into `findings-bulk-list.tsx` / page), `filterChipClass` (into `filter-chip-list.tsx` + `findings-filter-bar.tsx`).
  - Risk: low
  - Impact: ~150–200 LOC of indirection / 5–7 files removed

- [ ] **Unify workspace read/load layers (5+ ways to get the same slice)**
  - Why: `workspace.ts` (286 lines: `prepareWorkspaceState`, `readViewerSession`, `loadViewerWorkspaceState`, `checkProjectAccess`/`requireProjectAccess`/`requireAlertAccess`/`viewerCanViewProject`, `controlById`, `findingById`/`findRemediationForFinding`/`remediationForFinding`), `workspace-load.ts` (`loadTenancyDb`, `loadProjectWriteDb`, `loadProjectRuntime`), `project-runtime.ts` (`getProjectRuntime`, `getWorkspace`, `loadActiveProjectPage`), `project-view.ts` (769 lines — largest server file), `project-scope.ts`, `orgs.ts` (incl. `loadOrgExportData:164-195`), `org-queries.ts`, `org-membership.ts`, `project-visibility.ts` (`assertProjectPermission` vs `checkProjectAccess` vs `requireProjectAccess` — three permission spellings), `project-rows.ts` (`stampEvidenceActor`). In-write lookups (`findingById`, `remediationForFinding`) vs page previews (`requireFinding`/`requireRemediationForFinding` in `project-view.ts`) duplicate each other by design comment.
  - Where: `src/server/workspace/*.ts`, `packages/db/src/workspace-load.ts:62-96`, `packages/db/src/repo/*`
  - Reduction: one read path per context (tenancy vs project-runtime vs export); single permission assert; single finding/remediation lookup used by both writes and pages; fold `project-scope.ts` predicates into `report.ts`/`project-view.ts` call sites if single-use.
  - Risk: medium (tenant isolation; needs `workspace.test.ts` + `test:db` green)
  - Impact: ~250–400 LOC / 2–3 files / 2–3 overlapping APIs removed

- [ ] **Replace hand-rolled DB plumbing (`mappers` + custom deep-equal + guard) with direct Drizzle**
  - Why: `packages/db/src/repo/mappers.ts` (151 lines: `*ToRow`/`rowToEvidence`/`nullToUndefined`/`withPayload` per entity) + `repo/apply.ts:129-152` (`equalIgnoringUpdatedAt` — recursive deep-equal ignoring one key) + `repo/upsert-guard.ts:13-24` (`filterNotStale`) + `snapshotProjectSlice`/`projectScopedSlice` helpers. Standard `isEqual`-with-ignore or Drizzle `onConflictDoUpdate` with explicit columns removes the bespoke comparator.
  - Where: `packages/db/src/repo/mappers.ts:28-151`, `packages/db/src/repo/apply.ts`, `packages/db/src/repo/upsert-guard.ts`, `packages/db/src/repo/evidence.ts:80-82` (`escapeLikeLiteral` — check if Drizzle param handles it)
  - Reduction: delete `withPayload`/`nullToUndefined` (inline `?? undefined`); collapse `*ToRow` into the single `persist*` call site per entity; replace `equalIgnoringUpdatedAt` with a shallow compare on known columns or a shared `isEqual` + key-strip.
  - Risk: medium (persistence correctness; run `test:db` + `apply.test.ts` + `mappers.test.ts` first, then delete)
  - Impact: ~150–220 LOC / 1–2 files

- [ ] **Consolidate AST/ARIA thin helpers (`parse.ts` + `heuristic-utils` + `a11y-*`)**
  - Why: `parse.ts` hubs (`getAttribute` 90 callers, `tagNameOf` 86, `visitJsxTags` 63, `stringValueOf` 60 — per `graft map` hotspots) + `heuristic-utils.ts` (`descendantTags` 14, `textContentOf` 13, `classNameTextOf` 5) + `a11y-model.ts`/`a11y-aria.ts` one-line wrappers (`isNativeInteractive`, `nativeSatisfiesRole`, `isDecorativeOrHidden`, `isPresentationRole`). Per `packages/analysis-core/AGENTS.md`, `heuristic-utils.ts` has ~14 dependents — the wrappers are load-bearing but the ARIA one-liners add a hop without logic.
  - Where: `packages/analysis-core/src/parse.ts:56-106`, `packages/analysis-core/src/checks/heuristic-utils.ts`, `packages/analysis-core/src/a11y-model.ts:197-202`, `packages/analysis-core/src/a11y-aria.ts:78-87`
  - Reduction: inline single-use wrappers (`isNativeInteractive`, `nativeSatisfiesRole`) at call sites; do NOT split `heuristic-utils.ts` further; document don't-rename constraint (already in AGENTS.md) instead of adding wrapper types.
  - Risk: low
  - Impact: ~60–100 LOC / 0–1 files / fewer hops

- [ ] **Merge parallel catalog trees (RGAA + WCAG) and guidance layers**
  - Why: `catalog/rgaa/{controls,presets,guidance,pertinence-twins}.ts` mirrors `catalog/wcag/{controls,presets}.ts` + `catalog.ts` (`shippedCatalog` 8-line wrapper returning two constants) + `registry.ts` (`presetById`, `projectDefaultPresetId`, `FrameworkPresetSummary` Pick-type) + `control-theme.ts` (`controlDisplayCodes`, `controlForDisplay`, `secondaryReferenceLabel`) + `guidance.ts` per framework. Same `Control` shape, two hand-maintained copies + a theming pass that could be data.
  - Where: `packages/analysis-core/src/catalog/*`, `packages/analysis-core/src/catalog/rgaa/*`, `packages/analysis-core/src/catalog/wcag/*`
  - Reduction: one `controls.ts` + one `presets.ts` keyed by framework; fold `pertinence-twins.ts` into control data (boolean/refs, not a module); inline `shippedCatalog()` at the 15 call sites or keep only if lazy-load is needed (currently returns constants — `FRAMEWORK_BY_PRESET` cache in `report.ts` proves it is static); delete `FrameworkPresetSummary` Pick-type (inline at its 1–2 consumers).
  - Risk: medium (reference data; `catalog-coverage.test.ts`, `catalog-ids.test.ts`, `check-authority.integration.test.ts` must stay green)
  - Impact: ~200–350 LOC / 3–5 files

- [ ] **Prune UI primitive sprawl (shadcn bulk + single-use wrappers)**
  - Why: `src/components/ui/` ships 16 primitives (`avatar`, `collapsible`, `dropdown-menu`, `sonner`, `table`, `textarea`, `sheet`, …). `graft grep collapsible|avatar|sonner|dropdown-menu` shows `avatar` used only by `auth-controls.tsx`, `collapsible` only by `requirement-remediation-actions.tsx`, `dropdown-menu` only by `evidence-export-menu.tsx` + `auth-controls.tsx`. Each pulls Radix + CVA weight for one screen. Alongside: `MetaTile`/`PageContent`/`PageActionLink`/`NoProjectNotice` (`page-primitives.tsx:115-250` — 1–8 line divs), `filterChipClass`, `FormattedDateTime` (35 lines wrapping `formatDateTime` + `cn(className)` — the `cn()` of one arg is a no-op), `PathnameFocus` (18 lines) + `FocusFilterResults` (26 lines, `return null` + one `useEffect` each), `ThemeToggle` (`useEffect(() => setMounted(true), [])` guard), `use-copy.ts` (32 lines) + `copy-button.tsx` (thin consumer), `use-github-repo-search.ts` (162 lines: `useCallback` + 2× `useEffect` + `useRef` for a picker typeahead) vs `github-repo-search.ts` (57 lines).
  - Where: `src/components/ui/*.tsx`, `src/components/page-primitives.tsx`, `src/components/formatted-datetime.tsx:19-35`, `src/components/pathname-focus.tsx`, `src/components/findings/focus-filter-results.tsx`, `src/components/theme-toggle.tsx:19`, `src/hooks/use-copy.ts`, `src/components/use-github-repo-search.ts`, `src/components/github-repo-search.ts`, `src/components/dashboard/runtime-coverage-chip.tsx`, `src/components/dashboard/assessment-job-status-live.tsx` vs `assessment-job-status.tsx`
  - Reduction: replace single-use Radix primitives with native elements (`<details>`, `<select>`, plain buttons); inline `PageContent`/`MetaTile`/`PageActionLink` (or keep only `PageHeader`+`EmptyState`, the two with real logic); merge `assessment-job-status-live.tsx` into `assessment-job-status.tsx`; fold `use-github-repo-search` into the picker or use `use()`/server typeahead route directly; delete `FormattedDateTime`'s `cn()` call.
  - Risk: low–medium (visual snapshots; keep a11y focus behavior in `app-error-card.tsx:38-40` and `pathname-focus` tests)
  - Impact: ~300–500 LOC / 5–10 files / 2–4 dependencies' worth of weight

## P2 — Minor reduction

- [ ] **Collapse redundant date/time split (`formatDateTime` vs `formatDateTimeWithZone`)**
  - Why: `datetime.ts` (38 lines, half doc comment) exposes two functions differing by one `(UTC±HH:MM)` suffix; `formatDateTimeValue` is private but `formatDateTime` (2 callers: `FormattedDateTime` + test) exists only to serve the wrapper. Reports always want the zone variant (6 callers per `graft grep formatDate`); interactive UI always wants the component.
  - Where: `src/core/datetime.ts:11-38`, `src/components/formatted-datetime.tsx`, `src/server/reporting/report-markdown.ts`, `src/server/reporting/report-html/*`
  - Reduction: export `formatDateTimeWithZone` + `<FormattedDateTime>` only; delete bare `formatDateTime` export (inline `toLocaleString` in the component if truly UI-only).
  - Risk: low
  - Impact: ~15 LOC / 0–1 APIs

- [ ] **Remove no-op/over-specified memoization and effects**
  - Why: `github-repo-picker.tsx:36` (`useMemo` over a cheap group-by), `create-pr-form.tsx:21` (`useMemo` over a string), `use-github-repo-search.ts:49` (`useCallback` wrapping a fetch called from 2 effects), `use-action-toast.ts:56-62` (6-dep effect where `successAction` object identity re-fires toasts — should be a ref or stable key), `confirm-submit-button.tsx:70-79` + `stateful-action-form.tsx:23-27` (two `wasPending`/`refreshedFor` refs tracking the same settle), `app-error-card.tsx:38-40` (focus-on-mount — keep but standardize; do not replicate in each boundary).
  - Where: files/lines above + `src/components/findings/finding-queue-nav.tsx:55`, `src/components/dashboard/assessment-job-status-live.tsx:34`, `src/components/org-data-lifecycle.tsx:55`
  - Reduction: delete `useMemo`/`useCallback` where the computation is trivial or deps are unstable; standardize one `useSettledEffect` or inline; stabilize `successAction` (id, not object) if toasts double-fire.
  - Risk: low (verify no extra renders break polling intervals)
  - Impact: ~60–100 LOC / clearer render semantics

- [ ] **Drop defensive code the platform already guarantees**
  - Why: `focus-filter-results.tsx:13-18` (try/catch around `sessionStorage` — Safari private mode is the only case; a `typeof window` guard or shared `safeStorage` suffices), `use-copy.ts:20-28` (try/catch → toast + `setTimeout` leak without cleanup), `filter-params/params.ts:9-26` (`firstParam`/`trimmedQuery` re-implement `searchParams.get()?.trim()`), `validate.ts:52-68` (`formRecord` re-implements `Object.fromEntries(formData.entries())` + multi-value handling already covered by `findingIdsField`), `repo-checkout.ts:171-182` (`isRefNotFoundError` checks both `.code` and regex — pick one), `connect-github.ts:32-46` (`assertAssessableRoot` triple `existsSync`/`statSync`/`hasSourceFiles` — `hasSourceFiles` try/catch covers missing paths), `url-safety.ts` + `assertSafeRuntimeUrl` double-checks, `redact.ts` copies applied in both `redactError` and `reportError`.
  - Where: files/lines above
  - Reduction: one `safeStorage` helper or delete guards; `clearTimeout` on unmount in `useCopy`; use `formData.get()`/native `URLSearchParams`; single error-shape check per boundary.
  - Risk: low
  - Impact: ~80–120 LOC

- [ ] **Fold validation micro-helpers (`parseInput` vs `parseEntityId` vs `parseForm`)**
  - Why: `validate.ts:99-120` — `parseEntityId(value)` is `parseInput(entityIdSchema, value)` with a default message; `parseForm`/`parseInput` differ only by `formRecord()` pre-step. 70 hits across 18 files (`graft grep parseEntityId|parseForm|parseInput`) show most call sites could call `schema.parse` + one `toPublicError` mapper. `requiredField`/`findingIdsField`/`optionalNoteSchema`/`firstIssueMessage`/`parseUnknown` are each 5–15 lines used a handful of times.
  - Where: `src/core/validate.ts:18-120`
  - Reduction: keep `entityIdSchema` + `parseForm` + `parseInput`; delete `parseEntityId` (10 callers → `parseInput(entityIdSchema, …)`); delete `parseUnknown` if 0–1 callers (verify with `graft callers parseUnknown`); keep the rest — do not invent a shorter Zod DSL.
  - Risk: low
  - Impact: ~20–40 LOC / 1 API

- [ ] **Delete test-only / harness / scaffolding leftovers from prod bundles**
  - Why: `vitest.server-only-stub.js` + `vitest.setup.ts` referenced only by tests, `src/server/e2e-harness.ts` (57 lines) + `scripts/e2e-seed.ts` + `scripts/db-reset.ts` + `scripts/ensure-org-owner.ts` + `scripts/operations-check.ts` + `scripts/build-worker.mjs` + `scripts/postinstall-ssrf-guard.mjs` each encode one-off env/flag logic (`--conditions=react-server` repeated in 5 `package.json` scripts). `next.config.ts` lists `linkinator`, `playwright`, `axe-core`, `html-validate` as externals with per-package comments that duplicate `architecture.md`.
  - Where: `vitest.server-only-stub.js`, `src/server/e2e-harness*.ts`, `scripts/*`, `package.json:18-34`, `next.config.ts`
  - Reduction: move harness/seed behind `E2E_AUTH_ENABLED` dynamic import (already the convention) and out of the prod graph; collapse `tsx --conditions=react-server` into one `tsx:server` alias script; trim `next.config.ts` comments that mirror docs.
  - Risk: low
  - Impact: ~50–100 LOC / faster `verify:gate`

## P3 — Optional

- [ ] **Flatten tiny type/interface layers that mirror domain types**
  - Why: `FrameworkPresetSummary` (`Pick<FrameworkPreset,…> & { controlCount }`), `ReportLoadResult` (`{ ok:false; response } | { ok:true; … }`), `CustomChecksResult`/`ProbeResult`/`GuardedProbe` (3 types for one `runProbe` signature), `FindingActView` (10-variant union in `finding-act.ts:37-55` + `chrome`/`runtimeAct`/`sourceGenerate` splitters — consider one `beat` + flags), `UnableToVerifyReason` union + `unableToVerifyReasonLabel` table (could be a single `Record`), `PageSlice`, `FilterFindingsContext`, `ConnectWritePayload`/`ConnectWriteContext`/`OrgWritePayload`/`OrgWriteContext` (payload+context pairs per write helper — one generic suffices after P0 unification).
  - Where: `packages/analysis-core/src/catalog/registry.ts:26-29`, `src/server/reporting/report.ts:37-39`, `packages/analysis-core/src/runtime/custom-checks/index.ts:68-84`, `src/core/finding-act.ts`, `src/core/finding-priority.ts:315-379`, `src/server/workspace/workspace-write.ts:53-65,279-289`
  - Reduction: inline single-use Picks/unions at consumers; keep domain enums (`statuses.ts`, `entities.ts`) untouched.
  - Risk: low
  - Impact: ~60–100 LOC / simpler signatures

- [ ] **Remove premature caches and ID-keyed_maps for static data**
  - Why: `FRAMEWORK_BY_PRESET` + `DISPLAY_CONTROLS` + `CONTROLS_BY_ID` in `report.ts:41-88` cache catalog lookups that are `Array.find` over <200 static controls; `STATUS_TONE_*` precompute 5 `Record`s from one table at module load (`report-tones.ts:104-147`); `createErrorRef` (`action-state.ts:16-18`, `crypto.randomUUID().replaceAll…slice(0,12)`) + `unexpectedActionMessage` split could be one `shortId()`.
  - Where: `src/server/reporting/report.ts:41-88`, `src/core/display/report-tones.ts:87-147`, `src/server/action-state.ts:16-26`
  - Reduction: direct lookups (measure before caching); single `tone()` accessor returning `{ badge, accent, dot, report }` instead of 5 exported maps; one `errorRef()` helper.
  - Risk: low (perf-neutral at current catalog size; re-add cache only with a benchmark)
  - Impact: ~40–70 LOC

- [ ] **Standardize control-flow nits (early returns, ternaries, `??` chains)**
  - Why: scattered `if (!x) return null` vs nested ternaries (`auto-submit-select-form.tsx:45-49`, `page-primitives.tsx:44-68`, `badges.tsx:55-62`), `?.` + `??` + `||` mixes in `formRecord`/`firstParam`/`trimmedQuery`, `Array.from({length:3}).map` skeleton in `org/loading.tsx` repeated per route `loading.tsx`. No behavior change — readability only, so lowest priority.
  - Where: `src/components/*`, `src/app/**/loading.tsx`, `src/core/filter-params/*`
  - Reduction: early returns everywhere; one shared `LoadingSkeleton` instead of per-route `loading.tsx` copies (verify App Router `loading.tsx` convention still needs per-folder files — if so, keep files but share the inner component).
  - Risk: low
  - Impact: ~30–60 LOC / consistency only

---

## Biggest Wins (top 8)

1. **Runtime probe consolidation** — ~25 files → ~8 theme modules + 1 harness (~800–1200 LOC).
2. ~~**Write-pipeline unification** (`withProjectWrite`/`withFindingWrite`/`withOrgWrite`/`withConnectWrite`) — ~120–150 LOC + 2 lock-path concepts.~~ — DONE 2026-09-17 (shared tail only; lock paths kept — see item note).
3. **Report stack merge** (model + markdown + HTML + caches) — ~400–600 LOC + 2–3 files.
4. **Display/badge tower collapse** (tones + status tables + 7 badge wrappers + tooltip + `mustGet` + barrels) — ~350–450 LOC + 4–5 files.
5. ~~**Action wrapper deletion** (`define-action.ts` + guards + route lists) — ~120–180 LOC + 2 layers.~~ — DECIDED 2026-09-17: keep (6 call sites); `requireFindingContext` + compat re-export deleted instead.
6. **Error-reporting merge + demo deletion** (`observability` + `report-client-error` + `ReportedError` + `sentry-example-page`) — ~300–400 LOC + 3–4 files.
7. **Form-stack simplification** (`StatefulActionForm` + `ConfirmSubmitButton` + toasts + duplicate note fields) — ~200–300 LOC.
8. **UI primitive pruning** (single-use Radix + null-components + micro-wrappers) — ~300–500 LOC + 5–10 files.

> Estimated combined upside: **~2,500–4,000 LOC and ~25–45 files** without behavior change, plus fewer concepts to hold (one write path, one report model, one badge path, one form path, one probe harness). Start with P0 in order; each item lists exact files and its own verification gate so they land independently.

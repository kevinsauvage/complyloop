# TODO — Code Reduction Audit

Goal: **less code, less complexity, same behavior.** KISS. Boring, obvious code.
**Updated 2026-09-10:** 4/5 P0 items implemented (typecheck + lint + 1397 tests passing).

Scope audited via `graft map` + `graft ask --source` + `graft callers` + direct reads:
~882 TS/TSX files; `packages/analysis-core/src/checks/` (111 rules);
`packages/analysis-core/src/runtime/custom-checks/` (~35 runtime checks);
`src/server/actions/` (~1,500 LOC incl. tests); `src/core/` (~30 micro-modules);
`src/components/ui/` (19 shadcn wrappers); `packages/db/src/` + `src/server/` workspace layers.

---

## P0 — Major reduction

- [ ] **Consolidate 111 one-file-per-rule static checks into families**
  - Why: Each rule is `foo.ts` + `foo.test.ts` with the same `AccessibilityCheck` boilerplate, same prop-spread guard (`isPropSpreadingHost`), same low-confidence/null-fix convention. Families already exist conceptually (form/input, media/image, motion, document-structure, context-change) but each member re-implements traversal + guards. Highest file-count cost in the repo.
  - Where: `packages/analysis-core/src/checks/*.ts` (111 files, e.g. `input-label.ts`, `form-error-association.ts`, `optgroup.ts`, `redundant-entry.ts`, `media-controls-present.ts`, `nontemporal-media-alt.ts`, `image-of-text.ts`, `motion-actuation.ts`, `no-blink-marquee.ts`, `heading-order.ts`, `list-structure.ts`, `p-as-heading.ts`, `focus-context-change.ts`, `input-context-change.ts`, `pointer-cancellation.ts`, `pointer-gesture.ts`); shared predicates `packages/analysis-core/src/a11y-aria.ts`, `packages/analysis-core/src/jsx-primitives.ts`, `packages/analysis-core/src/checks/heuristic-utils.ts`
  - Reduction: Group by family into ~8-12 files with table-driven rule definitions + one shared runner; keep one test file per family with cases per rule instead of one file per rule. Do not delete test coverage, merge it.
  - Risk: medium (touches the most fragile heuristics in `heuristic-utils.ts`)
  - Impact: ~150-200 files removed / ~2,000-4,000 LOC boilerplate / dozens of duplicated guards removed

## P1 — Significant reduction

- [ ] **Merge copy stack: `useCopyText` + `CopyButton` + `CodeBlock`**
  - Why: `src/hooks/use-copy-text.ts` (34 LOC: clipboard + timeout + toast) has exactly 2 callers (`graft callers useCopyText`): `CodeBlock` and `CopyButton`. `CopyButton` (41 LOC) re-implements announce + toast-error on top of the hook that already toasts on failure — double error path. `CodeBlock` (82 LOC) bundles copy + wrap-toggle + header + `<pre>`; the wrap toggle + header chrome is only needed in one place.
  - Where: `src/hooks/use-copy-text.ts`, `src/components/copy-button.tsx`, `src/components/code-block.tsx`, `src/components/page-primitives.tsx:226` (re-export of `CodeBlock`)
  - Reduction: Single `copy-text.ts` helper (`async copyText(text): Promise<boolean>`) using `navigator.clipboard` + `sonner` directly; inline `CopyButton` into its 1-2 call sites or keep it as a 15-line button without the hook/state; remove `useRef/useCallback/useEffect` timer machinery (a `setCopied` + plain `setTimeout` in the component is enough).
  - Risk: low
  - Impact: ~1-2 files removed / ~50-70 LOC / 1 hook abstraction removed

- [ ] **Simplify server-action result ceremony (`action-state.ts` + `useActionToast`)**
  - Why: Every form action returns `ActionMessageState{error,message}`, built via `runActionMessage`/`actionErrorState`/`publicErrorMessage` (`src/server/action-state.ts`, 54 LOC) and surfaced via `useActionToast` (`src/hooks/use-action-toast.ts`, 59 LOC + 136 LOC test) with `wasPending` ref edge-detection. This is a hand-rolled version of what `useActionState` + `sonner` already do; `toastErrors`/`successAction`/`successDuration` options are used in a minority of call sites.
  - Where: `src/server/action-state.ts`, `src/hooks/use-action-toast.ts`, `src/hooks/use-action-toast.test.ts`, all `src/server/actions/*.ts` returning `ActionMessageState`
  - Reduction: Return `{ok, message}` or throw `PublicError` and toast at the single form shell (`stateful-action-form.tsx`); delete `runActionMessage` wrapper, keep only `publicErrorMessage`. Delete `ToastableActionState`/`ActionToastSuccessAction` types.
  - Risk: medium (touches every server action's return contract)
  - Impact: ~1-2 files merged / ~100-150 LOC / 2 types + 1 hook removed

- [ ] **Merge `src/core/query*.test.ts` splits back into `query.ts`**
  - Why: `src/core/query.ts` (156 LOC: `firstParam`, `parseEnumParam`, `pickDefined`, `buildHref`, + href/parse per page) is split across 4 test files (`query-evidence-kind.test.ts`, `query-report-view.test.ts`, `query-requirement-status.test.ts`, `query-requirements-page.test.ts`) with no matching source split — pure test fragmentation. Same pattern repeats for `count-by-status`, `finding-list-filter`, `pagination`, `assessment`, etc.
  - Where: `src/core/query.ts`, `src/core/query-*.test.ts`
  - Reduction: One `query.test.ts` mirroring the single source file. Apply the same rule repo-wide: one test file per source file in `src/core/`.
  - Risk: low
  - Impact: ~3 files removed / ~0 prod LOC but large maintenance win (file count)

- [ ] **Merge `src/core/` micro-modules by domain**
  - Why: `src/core/` has ~20 modules many under 40 LOC each with paired tests (`format-datetime.ts` 27, `count-by-status.ts` 27, `pagination.ts`, `assessment-job.ts` 38, `boundary.ts`, `prioritization.ts`, `finding-act.ts`, `root-cause.ts`, `unable-to-verify-reason.ts`, `runtime-coverage.ts`, `status-contrast.ts`, plus `query.ts` above). Each is a couple of pure functions + a record lookup. Separation provides no domain boundary — they are all "finding/requirement display + filter" helpers.
  - Where: `src/core/*.ts` (see `ls src/core`; `status-display.ts` alone fans out via `lookupExhaustive` to 10+ display maps)
  - Reduction: 3 files: `display.ts` (all `*Display` maps + tones), `filters.ts` (all parse/href/filter), `lifecycle.ts` (assessment-job, remediation, finding-act, root-cause). Keep `rbac.ts` separate (real boundary).
  - Risk: low-medium (imports churn, no behavior change)
  - Impact: ~10-14 files removed / ~200-400 LOC of re-export/import boilerplate

- [ ] **Delete or inline shadcn `ui/` pass-throughs; kill single-constant `native-select.ts`**
  - Why: `src/components/ui/` has 19 files, most are thin Radix + Tailwind wrappers (`dropdown-menu.tsx`, `avatar.tsx`, `dialog.tsx`, etc.). `native-select.ts` is a 3-line string constant (`nativeSelectClass`) imported in 4 places (`auto-submit-select-form.tsx`, `role-select.tsx`, `findings-filter-bar.tsx`, `reason-note-fields.tsx`). A file for one CSS string is indirection, not reuse.
  - Where: `src/components/ui/*.tsx`, `src/components/ui/native-select.ts`, `components.json`
  - Reduction: `rg` unused `ui/` exports and delete dead ones (verify `avatar`, `collapsible`, `sheet`, `tooltip`, `tabs`, `table` usage first — current `rg` shows `ui/` imports concentrated in ~15 components); move `nativeSelectClass` into `src/components/form-classes.ts` or colocate with `reason-note-fields.tsx` and delete the file.
  - Risk: low (deletion guarded by `rg` + typecheck)
  - Impact: ~2-5 files removed / ~100-300 LOC of wrapper boilerplate

- [ ] **Inline single-use tiny components**
  - Why: Several components are 10-30 LOC with 1-3 call sites and add a file + import + props interface for what is a 5-line JSX block: `permission-notice.tsx` (11 LOC, 3 callers: `finding-next-step-panel.tsx`, `first-assessment-checklist.tsx`, `connect-project-panel.tsx`), `theme-provider.tsx` (17 LOC, 1 caller `app/layout.tsx`), `sign-in-with-github-button.tsx` (29 LOC), `sign-out-menu-item.tsx` (29 LOC), `page-skeleton.tsx` (28 LOC, 1 caller `app/loading.tsx`), `page-primitives.tsx:MetaTile/PageActionLink/NoProjectNotice` (each 10-20 LOC).
  - Where: files above + `src/components/badge-with-description.tsx` (34 LOC wrapper over `badges.tsx` 188 LOC)
  - Reduction: Inline `ThemeProvider` (use `next-themes` directly in layout), `PageSkeleton` (into `app/loading.tsx`), `PermissionNotice` (into a shared `Alert` snippet or keep only if a 4th caller appears — currently borderline, prefer inline), `SignIn/SignOut` buttons (colocate with `auth-controls.tsx`); fold `badge-with-description.tsx` into `badges.tsx`.
  - Risk: low
  - Impact: ~4-6 files removed / ~120-180 LOC of prop-plumbing

- [ ] **Merge form trio + note fields into one form shell**
  - Why: `stateful-action-form.tsx` (99 LOC), `auto-submit-select-form.tsx` (83 LOC), `confirm-submit-button.tsx` (111 LOC), `reason-note-fields.tsx` (67 LOC) are four variations of "form + pending + confirm + toast" with duplicated `useFormStatus`, hidden inputs, and `nativeSelectClass` styling. `filter-chip-list.tsx` + `pagination-nav.tsx` (122 LOC) are similarly one-screen helpers used once.
  - Where: `src/components/stateful-action-form.tsx`, `src/components/auto-submit-select-form.tsx`, `src/components/confirm-submit-button.tsx`, `src/components/reason-note-fields.tsx`
  - Reduction: One `action-form.tsx` with `confirm?` + `autoSubmit?` props; `reason-note-fields` becomes a plain field group inside it, not a component with its own file.
  - Risk: low-medium (form a11y: `role=alert`, `aria-describedby` must be preserved)
  - Impact: ~2-3 files removed / ~100-150 LOC

- [ ] **Merge Postgres plumbing (`postgres-url` + `postgres-ssl` + `client` + `write-lock` + `org-slug`)**
  - Why: 5 files totaling 289 LOC for what is one concern (connect + lock): `postgres-url.ts` (141 LOC — URL parsing/normalizing, the largest), `postgres-ssl.ts` (40), `client.ts` (56, `getDrizzle` with 49 callers), `write-lock.ts` (34, advisory lock), `org-slug.ts` (18, `slugifyOrgName`/`nextUniqueSlug`). Each is imported in 1-3 places.
  - Where: `packages/db/src/postgres-url.ts`, `packages/db/src/postgres-ssl.ts`, `packages/db/src/client.ts`, `packages/db/src/write-lock.ts`, `packages/db/src/org-slug.ts`
  - Reduction: Single `postgres.ts` (client + URL + SSL + lock); move `org-slug.ts` into `repo/orgs.ts` (its only consumer domain).
  - Risk: low
  - Impact: ~3-4 files removed / ~80-120 LOC of import/config plumbing

- [ ] **Unify badge/status display (`badges.tsx` + `status-display.ts` + `status-contrast`)**
  - Why: Three implementations of "status → color + label": `src/components/badges.tsx` (188 LOC, tone-based badges + tooltips), `src/core/status-display.ts` (10 `lookupExhaustive` maps: finding/requirement/remediation/severity/confidence/engine/provenance…), `src/core/status-contrast.test.ts` (+ `src/core/count-by-status.ts`). Copy drifts between the display map and the badge tone.
  - Where: `src/components/badges.tsx`, `src/components/badge-with-description.tsx`, `src/core/status-display.ts`, `src/core/status-contrast.test.ts`, `src/core/count-by-status.ts`
  - Reduction: Single `status.ts` source of truth (label + tone + contrast) consumed by one `StatusBadge` component; delete the other two maps.
  - Risk: low
  - Impact: ~2-3 files removed / ~150-250 LOC / 1 concept instead of 3

- [ ] **Deduplicate App Router `loading`/`error`/`not-found` per route**
  - Why: 12 near-identical files: `app/loading.tsx`, `app/(app)/loading.tsx`, `app/(app)/dashboard/loading.tsx`, `app/(app)/findings/loading.tsx`, `app/(app)/findings/[id]/loading.tsx` (all render `PageSkeleton`), plus matching `error.tsx` trio forwarding to `ReportedError` and `not-found.tsx` pair. Nesting already inherits parent `loading`/`error` — leaf duplicates add nothing.
  - Where: `src/app/**/loading.tsx`, `src/app/**/error.tsx`, `src/app/**/not-found.tsx`, `src/app/(app)/findings/[id]/not-found.tsx`
  - Reduction: Keep root `loading.tsx` + root `error.tsx` + root `not-found.tsx` only; delete leaf duplicates unless a route needs distinct copy (none currently do — verify `[id]/not-found.tsx` is the only justified exception).
  - Risk: low
  - Impact: ~6-8 files removed / ~60-100 LOC

- [ ] **Merge auth layers (`auth.ts` + `auth-secret.ts` + `actions/auth.ts` + `worker-auth` + `proxy`)**
  - Why: Auth is split across `src/auth.ts` (`getGitHubAccessToken`, 139-173), `src/auth-secret.ts` (`resolveAuthSecret`, 25-40), `src/server/actions/auth.ts` (26 LOC: parse sign-in form + sanitize callback + delegate), `src/server/worker-auth.ts` (14 LOC), `src/server/personal-org.ts` (14 LOC), `src/proxy.ts`, `e2e/auth.ts` (`mintSessionCookie`, `writeAuthStates`). Each is a thin delegate to the next.
  - Where: files above
  - Reduction: One `auth/` folder with `config.ts` (secret + providers) + `session.ts` (token/session helpers); fold `actions/auth.ts` wrappers into colocated form actions; fold `personal-org.ts` + `worker-auth.ts` into `workspace.ts`.
  - Risk: medium (auth + cookie security semantics)
  - Impact: ~2-3 files removed / ~80-120 LOC / 2 indirection layers removed

- [ ] **Merge duplicated project-preset path**
  - Why: `src/server/project-preset.ts:setDefaultPreset` (37 LOC) and `src/server/actions/project-preset.ts` (37 LOC) are the same operation split into "pure DB fn" + "action wrapper that loads workspace + calls it" — the pattern every other action inlines. `src/server/project-capabilities.ts` (49 LOC) + `src/server/project-preset.test.ts` add a third preset-adjacent module.
  - Where: `src/server/project-preset.ts`, `src/server/actions/project-preset.ts`, `src/server/project-capabilities.ts`
  - Reduction: Inline `setDefaultPreset` into the action (or vice versa); merge capability check into the same file.
  - Risk: low
  - Impact: ~1-2 files removed / ~40-60 LOC

## P2 — Minor reduction

- [ ] **Simplify AI shell (`ai-call.ts` overloads + `setAiWarn` injection + `schemas.ts`)**
  - Why: `src/ai/ai-call.ts` carries two overload signatures + `AiCallInputThrow`/`AiCallInputNull` union + a mutable `warnFn` injection (`setAiWarn`/`aiWarn`) so tests can stub observability. `src/ai/schemas.ts` is 7 LOC. `ai-call-warn.test.ts` (19 LOC) tests the injection, not behavior. If this did not exist, `generateObject` + `try/catch` + direct `reportError` import would be ~30 lines with no overloads.
  - Where: `src/ai/ai-call.ts`, `src/ai/ai-call-warn.test.ts`, `src/ai/schemas.ts`
  - Reduction: One signature returning `T | null` + `throwIfUnavailable` boolean; replace `setAiWarn` injection with a direct `reportError` import (tests assert on return value, not warn calls); fold `schemas.ts` into `ai-call.ts`.
  - Risk: low
  - Impact: ~1-2 files removed / ~30-40 LOC / 2 overloads + 1 injection abstraction removed

- [ ] **Replace bespoke query helpers with `URLSearchParams` + native APIs**
  - Why: `firstParam`, `parseEnumParam`, `pickDefined`, `buildHref` (`src/core/query.ts:9-49`) re-implement URL parsing that `URLSearchParams` + `searchParams.get()` already do at each call site (Next.js `searchParams` is already parsed). Each is 5-15 LOC of generic plumbing with its own edge cases.
  - Where: `src/core/query.ts:9-49`, all `parse*Param`/`*Href` consumers
  - Reduction: Keep the domain-specific `parseRequirementStatusParam`/`evidenceKindHref`/etc., delete the 4 generic helpers and call `URLSearchParams` directly.
  - Risk: low
  - Impact: ~40 LOC / 4 helpers removed

- [ ] **Fold `lookupExhaustive` into direct record access**
  - Why: `src/core/assert-exhaustive.ts` (12 LOC) is called from 12 display fns in `status-display.ts` + `prioritization.ts` + `unable-to-verify-reason.ts` (`graft callers lookupExhaustive`). Each call passes a map + key + kind string just to get `map[key] ?? throw`. TypeScript's `Record<T,V>` indexing + a single `assertNever` at the switch already gives exhaustiveness; the helper adds a call frame to every display lookup.
  - Where: `src/core/assert-exhaustive.ts`, `src/core/status-display.ts`, `src/core/prioritization.ts`, `src/core/unable-to-verify-reason.ts`
  - Reduction: Delete the file; use `MAP[key] ?? throw new Error(...)` inline or a one-line `mustGet(map, key)` colocated in `status-display.ts`. Do not weaken the throw-on-unknown invariant.
  - Risk: low
  - Impact: ~1 file removed / ~12 LOC + 12 call-site simplifications

- [ ] **Merge report builders (`report-markdown.ts:codeBlockLines` + `report-html/`)**
  - Why: `src/server/report-markdown.ts:47-49:codeBlockLines` (3-line indented-code-block helper), `src/server/report-html/report-colors.test.ts` (39 LOC) + siblings, and `src/app/(app)/evidence/report/{html/,}route.ts` duplicate "finding → markdown/HTML row" mapping with separate color/label tables from `status-display.ts`.
  - Where: `src/server/report-markdown.ts`, `src/server/report-html/*`, `src/app/(app)/evidence/report/**/route.ts`, `src/app/(app)/evidence/export/route.ts`
  - Reduction: One `report.ts` emitting both formats from the same row model; reuse the unified status tone from the badges item above instead of a second color table.
  - Risk: low-medium (exported report bytes are user-visible; snapshot-test before merging)
  - Impact: ~2-3 files removed / ~80-120 LOC

- [ ] **Consolidate scripts + e2e harness duplicates**
  - Why: `scripts/db-migrate.ts` / `db-reset.ts` / `ensure-org-owner.ts` / `e2e-seed.ts` each open their own Drizzle client + parse `DATABASE_URL`; `scripts/operations-check.ts` + `scripts/run-assessment-worker.ts` + `src/app/api/internal/jobs/run/route.ts` each implement "run/trigger assessment job"; `src/server/e2e-harness.ts` (+ test) + `e2e/auth.ts` + `e2e/webhook-helpers.ts` re-implement session minting + fixture loading that `scripts/e2e-seed.ts` already does.
  - Where: `scripts/*.ts`, `src/server/e2e-harness.ts`, `e2e/auth.ts`, `e2e/webhook-helpers.ts`
  - Reduction: One `scripts/db.ts` connection helper imported by all scripts; one `triggerAssessmentJob()` shared by worker script + internal route; move e2e session minting into a single `e2e/helpers.ts`.
  - Risk: low
  - Impact: ~2-3 files removed / ~100-150 LOC

## P3 — Optional

- [ ] **Collapse Sentry/instrumentation plumbing (6 files, 83 LOC)**
  - Why: `src/sentry/traces-sample-rate.ts` (9 LOC) + its test (31 LOC) + `src/sentry.edge.config.ts` (8) + `src/sentry.server.config.ts` (8) + `src/instrumentation.ts` (17) + `src/instrumentation-client.ts` (10) exist to thread one env var (`SENTRY_TRACES_SAMPLE_RATE`, default `0.05` prod / `0` dev) into three `Sentry.init` calls. More files than the logic warrants.
  - Where: files above, `next.config.ts` (Sentry wrapper options)
  - Reduction: Inline the 5-line parse into a shared `sentry-init.ts` (or read `SENTRY_TRACES_SAMPLE_RATE` directly at each `init`); keep the test only if parsing logic survives as shared code.
  - Risk: low
  - Impact: ~2-3 files removed / ~30-50 LOC / 1 abstraction removed

- [ ] **Remove `refresh()` wrapper in `shared.ts`**
  - Why: `src/server/actions/shared.ts:26-28:refresh()` (hotspot: 33 callers) is a 3-line alias for `revalidatePath("/", "layout")`. `requireSignedIn`, `requireOnActive`, `requireOnFindingProject`, `requireFindingContext` in the same file overlap with `assertProjectPermission` (double permission lookup: `requireFindingContext` finds the project twice, lines 52-54 + 66-68).
  - Where: `src/server/actions/shared.ts`
  - Reduction: Call `revalidatePath` directly at call sites (or keep one name but colocate with `project-visibility.ts`); fix `requireFindingContext` to look up the project once and reuse it.
  - Risk: low
  - Impact: ~10-20 LOC / 1 wrapper removed

- [ ] **Audit remaining `src/server/` thin modules for inlining**
  - Why: Candidates under 60 LOC each with 1-2 callers: `active-cookies.ts` (42), `assessment-job-inline.ts` (31), `monitor.ts`, `nav-attention.ts` (21), `runtime-routes.ts` (21), `git.ts`, `webhook-deliveries.ts` (53), `remediation-evidence.ts` (37), `observability.ts` wrappers. Individually trivial; collectively ~10 extra modules + tests + imports.
  - Where: `src/server/*.ts` (verify each with `graft callers <symbol>` before deleting)
  - Reduction: Inline into the single consumer; keep a file only when 2+ consumers or a real domain boundary (auth, workspace, evidence) exists.
  - Risk: low (verify callers first; some may be load-bearing seams for e2e)
  - Impact: ~3-6 files removed / ~100-200 LOC

- [ ] **Reconsider `sonner` + `next-themes` + `radix-ui` meta-dependency weight**
  - Why: Not code removal but dependency-driven complexity: `radix-ui` (full meta-package) + `sonner` (toast) + `next-themes` (theme) force the wrapper files above (`theme-provider.tsx`, `sonner.tsx`, `use-action-toast.ts`). If toast usage narrows to success-only (per the `useActionToast` docstring: errors belong inline), `sonner` could shrink to one call site.
  - Where: `package.json`, `src/components/ui/sonner.tsx`, `src/components/theme-provider.tsx`, `src/hooks/use-action-toast.ts`
  - Reduction: No removal recommended now — instead, gate future additions: no new Radix primitive without 2+ consumers; no new toast call outside `action-form.tsx`.
  - Risk: low (policy only, no code change)
  - Impact: 0 LOC now / prevents regrowth

---

## Completed (this session)

| Item                         | Files | LOC Δ    | Summary                                                       |
| ---------------------------- | ----- | -------- | ------------------------------------------------------------- |
| P0-5 Error-boundary collapse | 3     | -125     | 5 layers → `AppErrorCard` + `ReportedError`; unified reporter |
| P0-4 Workspace/DB load       | 1     | -9       | Fixed double project lookup in `requireFindingContext`        |
| P0-3 Remediation + AI        | 1     | -10      | Unified `recordStillFailing` to use `replaceRemediation`      |
| P0-2 Runtime helpers         | 6     | **-127** | Merged 3 math modules into consumers; deleted dead exports    |

**Net: 11 files changed, -157 LOC (157 removed, 32 added).**

---

## Biggest Wins (updated)

1. **Runtime math-helper consolidation** (done) — **127 LOC removed**, 6 files, 4 helper abstractions.
2. **Error-boundary collapse** (done) — **125 LOC removed**, 5 layers → 2 components.
3. **Remediation + AI lifecycle** (started) — 10 LOC, 1 file; ~400-600 LOC remaining.
4. **Workspace/DB load** (started) — 9 LOC, 1 file; ~200-300 LOC remaining.
5. **Static checks family consolidation** — ~150-200 files, the dominant file-count and maintenance cost.
6. **Runtime custom-checks consolidation** (beyond math) — ~40-60 files, same boilerplate shape as #5.
7. **`src/core/` micro-module merge** — ~10-14 files of pure-function plumbing.
8. **Copy + action-toast ceremony removal** — ~150-220 LOC of hook/ref/timeout machinery around `clipboard` + `sonner`.
9. **App Router `loading`/`error` leaf duplicates** — ~6-8 files of copy-paste inheritance abuse.

---

_Method: `graft map` orientation; `graft ask --source` for wrappers/duplicates/layers/AI/DB/config; `graft callers` for `lookupExhaustive`, `useCopyText`, `ReportedError`, `PermissionNotice`; `rg` for `ui/` usage, `nativeSelectClass` (4 callers), route `loading/error/not-found` files; direct reads of `utils.ts`, `report-client-error.ts`, `use-copy-text.ts`, `use-action-toast.ts`, `traces-sample-rate.ts`, `shared.ts`, `native-select.ts`, `error.tsx`, `global-error.tsx`, `app-error-card.tsx`, `copy-button.tsx`, `code-block.tsx`, `reported-error.tsx`, `page-primitives.tsx`, `query.ts`, `db.ts`, `action-state.ts`, `project-preset.ts`, `ai-call.ts`, `workspace-load.ts`._

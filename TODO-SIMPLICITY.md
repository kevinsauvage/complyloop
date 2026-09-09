# TODO-SIMPLICITY — Unnecessary Complexity Audit

Source of truth: actual code (2026-09-09). Do not modify app code beyond what each item says.
After each item: `npm run lint && npm run typecheck` + targeted test noted, then `npm run build` for route/package changes.

## P1 — Significant unnecessary complexity

### 1. Three evidence routes share loader, differ only by serializer
- **Priority:** P1
- **Problem:** `evidence/report/route.ts` (markdown) and `evidence/report/html/route.ts` duplicate `loadReportInput` → `buildEngineering*/buildAudit*` branch; `evidence/export/route.ts` hand-rolls a third project-scoped dump.
- **Evidence:** `src/app/(app)/evidence/report/route.ts:23-40`, `src/app/(app)/evidence/report/html/route.ts:6-21`, `src/app/(app)/evidence/export/route.ts:13-33`, loader in `src/server/report.ts:79-129`.
- **Simplification:** Single `GET /evidence/report?format=md|html|json` reusing `loadReportInput`. Delete `export/route.ts` and `report/html/route.ts`; move JSON shape into `report-model.ts` next to markdown/HTML builders. Update links in evidence pages.
- **Verification:** `vitest run src/server/report.test.ts src/server/report-model.test.ts` + `curl` all three formats returns same finding/requirement counts.

### 2. Two boundary modules for one safeParse→throw idiom
- **Priority:** P1
- **Problem:** `server/boundary.ts` (`parseForm`/`parseInput`) duplicates `core/boundary.ts` (`formRecord`/`firstIssueMessage`/`parseUnknown`) — same `safeParse → throw` flow, differing only by `FormData` pre-step.
- **Evidence:** `src/server/boundary.ts:5-27`, `src/core/boundary.ts:15-85`.
- **Simplification:** Delete `src/server/boundary.ts`. Add one `parseBoundary(schema, value: unknown|FormData)` in `core/boundary.ts` throwing `PublicError` (convert `FormData` via existing `formRecord` inside). Update callers in `src/server/actions/*.ts`, `src/app/api/github/repos/route.ts`, `src/app/api/projects/[projectId]/assessment-jobs/route.ts`.
- **Verification:** `vitest run src/server/action-state.test.ts src/server/boundary.test.ts src/core/boundary.test.ts`; `npm run typecheck`.

### 3. Three copy-paste rule→check maps
- **Priority:** P1
- **Problem:** `jsx-a11y-map.ts`, `runtime/axe-map.ts`, `runtime/html-validate-map.ts` each define `Record<rule,CheckId>` + `checkIdForXRule()` + `xMappedCheckIds()` with identical shape.
- **Evidence:** `packages/analysis-core/src/jsx-a11y-map.ts:7-62`, `packages/analysis-core/src/runtime/axe-map.ts:7-154`, `packages/analysis-core/src/runtime/html-validate-map.ts:20-44`.
- **Simplification:** Create one `packages/analysis-core/src/rule-maps.ts`: `Record<AnalyzerId, Record<string,CheckId>>` + generic `checkIdForRule(analyzer, rule)` / `mappedCheckIds(analyzer)`. Delete 3 files, update imports + merge the 3 coverage tests into one parameterized test.
- **Verification:** `vitest run packages/analysis-core/src/check-registry.test.ts packages/analysis-core/src/runtime`.

### 4. `check-authority.ts` re-exposes registry fields as predicates
- **Priority:** P1
- **Problem:** Six one-line predicates (`isRuntimeOnlyCheck`, `isSiteLevelCheck`, …) + `authorityForCheck` just read `check-registry.ts` entry fields; adds import surface and a second place to update per check.
- **Evidence:** `packages/analysis-core/src/check-authority.ts:10-76`, `packages/analysis-core/src/check-registry.ts`, `packages/analysis-core/src/contract/requirement-status.ts:1`.
- **Simplification:** Export `getCheck(id)` from `check-registry.ts`; read `.authority/.runtimeOnly/...` at call sites. Move `HEURISTIC_RUNTIME_DOWNGRADE` into `runtime/findings.ts` (its only user). Delete `check-authority.ts`, keep `check-authority.test.ts` cases pointed at registry.
- **Verification:** `vitest run packages/analysis-core/src/check-authority.test.ts packages/analysis-core/src/scan.test.ts`.

### 5. Two merge/dedupe layers for one AST+runtime pipeline
- **Priority:** P1
- **Problem:** `merge-findings.ts` (AST suppression, ~27 lines) + `runtime/dedupe-runtime-findings.ts` (group-by + priority) always run together via `runtime/findings.ts`; splitting forces 3-file reasoning for one pipeline.
- **Evidence:** `packages/analysis-core/src/merge-findings.ts:16-27`, `packages/analysis-core/src/runtime/dedupe-runtime-findings.ts:81-126`, `packages/analysis-core/src/runtime/findings.ts:103-149`.
- **Simplification:** Single `mergeFindings(ast, runtimePages, {runtimeRan})` in `runtime/findings.ts`; inline the 3-predicate authority filter. Delete `merge-findings.ts`.
- **Verification:** `vitest run packages/analysis-core/src/merge-findings.test.ts packages/analysis-core/src/scan.test.ts`.

### 6. `db/repo/*` + `mappers.ts` over-decomposition for mechanical projections
- **Priority:** P1
- **Problem:** One CRUD wrapper per table (`assessments.ts`, `findings.ts`, `requirements.ts`, `remediations.ts`, `projects.ts`) + eight `XToRow` identity projections in `mappers.ts` exist only to sync indexed columns with `payload` JSONB.
- **Evidence:** `packages/db/src/repo/findings.ts:1-79`, `requirements.ts:1-64`, `remediations.ts:1-83`, `assessments.ts:1-66`, `repo/mappers.ts:19-102`, `packages/db/src/schema.ts:31-43`.
- **Simplification:** Collapse to `repo/reads.ts` + `repo/writes.ts` with generic `toRow(entity, ...cols)`. Keep `orgs.ts` (real logic) and `upsert-guard.ts` as-is.
- **Verification:** `npm run test:db`; `vitest run packages/db/src`.

### 7. `withOrgWrite` vs `withConnectWrite` differ by one persist loop
- **Priority:** P1
- **Problem:** Private `withLockedTenancy` + two public wrappers (~100 lines) differ only in persist loop (orgs/memberships vs projects/evidence) and one context field.
- **Evidence:** `src/server/workspace-write.ts:254-353`, contexts at `:65-70` vs `:317-321`.
- **Simplification:** Single `withTenancyWrite(options, fn)` where `fn` returns `{result, persist:(tx)=>Promise<void>}` (or a unified payload union). Delete one wrapper; update callers in `src/server/actions/*.ts`.
- **Verification:** `vitest run src/server/workspace.test.ts src/server/workspace.integration.test.ts`.

### 8. Over-generic `aiCall` + two single-constant modules
- **Priority:** P1
- **Problem:** `ai-call.ts` carries throw-vs-null overloads + `AiCallInputBase/Throw/Null` union + global `setAiWarn/aiWarn` setter for 3 callers; `ai/model.ts` (1 const) and `ai/schemas.ts` (`confidenceSchema`, duplicates contract `Confidence`) add import hops for 1–2 lines.
- **Evidence:** `src/ai/ai-call.ts:19-65`, `src/ai/model.ts:2`, `src/ai/schemas.ts:8`, wired in `src/instrumentation.ts:8`, used in `explainer.ts:48`, `remediation.ts:35`, `patch.ts:48`.
- **Simplification:** Replace with `tryGenerateObject(schema, prompt): Promise<obj|null>` + explicit `throw` at the `patch.ts` site; log via injected logger/`console.warn` and delete setter. Move `AI_MODEL` into `ai-call.ts`; import `Confidence` from contract or inline `z.enum`. Delete `model.ts`, `schemas.ts`.
- **Verification:** `vitest run src/ai/explainer.test.ts src/ai/remediation.test.ts src/ai/patch.test.ts src/ai/ai-call-warn.test.ts`.

## P2 — Worthwhile simplification

### 9. Trivial single-use server shims
- **Priority:** P2
- **Problem:** Four files each wrap one call or one `.filter`: `personal-org.ts` renames one repo call; `remediation-evidence.ts` is one template string; `github-access.ts` re-exports `github.ts`/`github-app.ts`; `project-visibility.ts:51-72` repackages 3 one-line `.filter(projectId===…)`.
- **Evidence:** `src/server/personal-org.ts:9-14`, `src/server/remediation-evidence.ts:5-10`, `src/server/github-access.ts:23-69`, `src/server/project-visibility.ts:14-72`, `src/server/org-queries.ts:5-51` (index rebuilt per single lookup).
- **Simplification:** Delete `personal-org.ts` (import `provisionPersonalOrg` directly in `src/auth.ts`, `actions/connect.ts`); inline evidence-summary template; call `github-app.ts`/`github.ts` directly; inline the 3 `.filter` at `report.ts`/`project-scope.ts` call sites; replace `OrgMembershipIndex` with direct `.find/.filter` (lists are tens of rows).
- **Verification:** `vitest run src/server/orgs.test.ts src/server/connect.test.ts src/server/github.test.ts src/server/handoff.test.ts`.

### 10. `query.ts` / `pagination.ts` / `count-by-status.ts` factory explosion
- **Priority:** P2
- **Problem:** ~10 one-line href/parse wrappers in `query.ts` (e.g. `reportMarkdownHref` vs `reportHtmlHref` differ by one segment); two public paginate wrappers differ by `slice` vs copy; `toCountMap` vs `countByStatus` duplicate the same loop.
- **Evidence:** `src/core/query.ts:30-141`, `src/core/pagination.ts:26-67`, `src/core/count-by-status.ts:2-27`.
- **Simplification:** Keep `buildHref/firstParam/parseEnumParam`; replace per-route fns with `reportHref(view,"markdown"|"html")` + direct `buildHref` at call sites. Single `paginateMeta(total,page,pageSize)` + inline slice; delete `pageSliceFromQuery`. Delete `toCountMap`, keep `countByStatus`.
- **Verification:** `vitest run src/core/pagination.test.ts src/core/count-by-status.test.ts src/core/query-evidence-kind.test.ts src/core/query-requirements-page.test.ts`.

### 11. Parallel status/evidence tone maps + trivial wrapper
- **Priority:** P2
- **Problem:** `EVIDENCE_TONE_*` aliases `STATUS_TONE_BADGE` values; `statusToneBadgeClass(tone)` is a ternary; doubles the tone mental model for pass/fail.
- **Evidence:** `src/core/status-display.ts:337-364,439-453`, used in `src/components/badges.tsx:64,78,130`.
- **Simplification:** Unify on one `StatusTone`; delete `EVIDENCE_TONE_*` and `statusToneBadgeClass` (index map directly); fold 28-line `badge-with-description.tsx:11-28` into `badges.tsx` or use native `title`.
- **Verification:** `vitest run src/core/status-display.test.ts src/components/badges.test.tsx`.

### 12. `adapters` facade + `control-theme.ts` UI grouping in wrong package
- **Priority:** P2
- **Problem:** `catalog.ts` concats two imports; `catalog-ids.ts` is a Set-check; `registry.ts` forwards to `rgaa/presets.ts`/`guidance.ts`; `control-theme.ts` does framework code-swap + theme bucketing (presentation) inside persistence package.
- **Evidence:** `packages/adapters/src/catalog.ts:5-14`, `catalog-ids.ts:6-11`, `registry.ts:15-44`, `control-theme.ts:34-102`.
- **Simplification:** Export `rgaa/controls,presets,guidance` directly; delete `catalog.ts`/`catalog-ids.ts`/`registry.ts`; move `control-theme.ts` to `src/core/` or derive theme from `control.code` at render.
- **Verification:** `vitest run packages/adapters` + `npm run typecheck`.

### 13. Triplicated error boundaries, switchers, theme passthrough, filter chips
- **Priority:** P2
- **Problem:** `error.tsx` vs `global-error.tsx` differ by one sentence + shell; `org-switcher.tsx` vs `project-switcher.tsx` are 20-line aliases for `AutoSubmitSelectForm`; `theme-provider.tsx` fixes all props at the single call site; `RequirementsStatusChips` ≈ `EvidenceKindChips` over same `FilterChipList`.
- **Evidence:** `src/app/error.tsx:7-25`, `src/app/global-error.tsx:8-31`, `src/components/app-error-card.tsx:24-28`, `src/components/org-switcher.tsx:14-27`, `src/components/project-switcher.tsx:14-29`, `src/components/theme-provider.tsx:6-17` (used once in `src/app/layout.tsx:32-37`), `requirements-status-chips.tsx:18-44`, `evidence-kind-chips.tsx:16-37`.
- **Simplification:** One boundary component with `description` prop (`global-error` adds shell only). Call `AutoSubmitSelectForm` directly in `workspace-context.tsx:109-117`, delete both switchers. Inline `NextThemesProvider` in `layout.tsx`, delete file. Generic `StatusFilterChips<T>({order,counts,hrefFor,Badge})`.
- **Verification:** `vitest run src/app/error.test.tsx src/components/app-shell.test.tsx src/components/auto-submit-select-form.test.tsx`; `npm run build`.

## P3 — Minor cleanup

### 14. Config / scripts that should be globs, one-liners, or env
- **Priority:** P3
- **Problem:** `vitest.config.mts` lists individual test/repo files instead of globs; whole `vitest.smoke.config.mts` exists for one file + timeout; `scripts/env.ts` (dotenv loader), `db-reset.ts` subprocess (`spawnSync tsx db-migrate`), `backup-postgres.sh` (one `pg_dump`) are wrappers; hardcoded ngrok host committed.
- **Evidence:** `vitest.config.mts:4-13,46-86`, `vitest.smoke.config.mts:1-13` + `package.json:23`, `scripts/env.ts:7-10`, `scripts/db-reset.ts:51-54` vs `scripts/db-migrate.ts:21-61`, `scripts/backup-postgres.sh:1-13` + `package.json:39`, `next.config.ts:28`.
- **Simplification:** Use `packages/analysis-core/src/runtime/custom-checks/*.test.ts` and `packages/db/src/repo/**` globs; delete smoke config → `vitest run packages/check/src/check-pack.smoke.test.ts --testTimeout=120000`. Export `applyMigrations()` from `db-migrate.ts` and import it; replace `env.ts` with `tsx --env-file=.env.local`; replace backup script with npm one-liner. Read dev origins from `process.env.ALLOWED_DEV_ORIGINS?.split(",") ?? []`.
- **Verification:** `npm run test -- --list` still discovers same files; `npm run test:check-pack` equivalent command passes; `npx tsc --noEmit -p scripts` clean.

### 15. Tripled package build config + dual export conditions
- **Priority:** P3
- **Problem:** Identical `tsconfig.build.json` + `build/lint/typecheck/test` scripts + `./*→src/*.ts` vs `dist/*.js` export blocks copied across `analysis-core`/`db`/`adapters` (already drifted: `check` uses custom `scripts/build.mjs` + duplicated deps).
- **Evidence:** `packages/analysis-core/package.json:9-20,49-55`, `packages/db/package.json`, `packages/adapters/package.json`, `packages/*/tsconfig.build.json:1-16`, `packages/check/scripts/build.mjs:1-10`, `packages/check/package.json:17-28` vs `analysis-core/scan.ts:41-51`.
- **Simplification:** Root `tsconfig.build.base.json` + single `exports` condition; delete per-package copies. Make `check` a thin bin shim with real `dependencies: {@complyloop/analysis-core}` (or `cli.ts` in analysis-core), delete `scripts/build.mjs` + duplicated dep list.
- **Verification:** `npm run build:core && npm run build:db && npm run build:check && npm run build`.

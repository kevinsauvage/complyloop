# TODO — Code Duplication

Source of truth: actual code (audited 2026-09-10). Only high-value, same-concept duplication. Do not abstract coincidental similarity.

## P0 — correctness/consistency risk

### DUP-01: GitHub duplicate-connect uses exact match in writer, normalized match in guard
- **Priority:** P0
- **Duplication:** Same concept "repo already connected in org" implemented twice with different equality.
- **Evidence:**
  - `src/server/connect-github.ts:51 findConnectedGitHubProject` (uses `normalizeGitHubFullName`, org-scoped)
  - `src/server/connect-github.ts:71 connectedGitHubProjectsByFullName` (same loop → map)
  - `src/server/connect-github.ts:116-121 connectGitHubRepo` inner check uses `project.github?.fullName === fullName || project.sourceRef === sourceRef` (exact, not normalized)
  - Caller `src/server/actions/connect.ts:116` pre-checks with normalized version, then writer re-checks exact and silently no-ops.
- **Impact:** `Owner/Repo` vs `owner/repo` can pass action guard then no-op (or double-connect); picker map can disagree with write guard.
- **Fix:** In `connectGitHubRepo`, replace inline `db.projects.find(...)` with call to `findConnectedGitHubProject(db.projects, fullName, input.orgId)`. Delete the `sourceRef` exact-match branch unless needed, then make `connectedGitHubProjectsByFullName` reuse it (build map by filtering with the single predicate).
- **Verification:** `vitest run src/server/connect.test.ts src/server/actions/connect.test.ts`; add case: existing `Acme/Shop` + input `acme/shop` → returns existing, no new project, no evidence.

### DUP-02: Upsert stale-write guard not applied uniformly
- **Priority:** P0
- **Duplication:** Same "don't overwrite newer payload with stale write" concept in 3 spellings.
- **Evidence:**
  - `packages/db/src/repo/upsert-guard.ts:22 filterStalePayloadWrites`, `:50 upsertPayloadRows`
  - `packages/db/src/repo/findings.ts:45`, `packages/db/src/repo/remediations.ts:51` use `upsertPayloadRows`
  - `packages/db/src/repo/requirements.ts:35` hand-rolls `filterStalePayloadWrites` + `insert`
  - `packages/db/src/repo/alerts.ts:53 upsertAlerts`, `packages/db/src/repo/orgs.ts:82 upsertMembership`, `packages/db/src/repo/projects.ts:11 updateProject` hand-write `onConflictDoUpdate` with no guard.
- **Impact:** Adding a projected column or fixing `stampedNow`/guard requires 5–6 edits; alerts/memberships/projects can silently clobber newer rows with stale writes.
- **Fix:** Extend `upsertPayloadRows` (or add `upsertPayloadRowsNoGuard` opt-out) to cover requirements/alerts/memberships; migrate `requirements.ts` and `alerts.ts` first. Keep per-table conflict clause as parameter, share `fetchDbUpdatedAtById` closure and `excluded.*` projection.
- **Verification:** `vitest run packages/db/src/repo/upsert-guard.test.ts packages/db/src/repo/apply.test.ts`; add stale-write test for alerts (newer DB row + older write → kept).

### DUP-03: Latest-assessment tie-break differs DB vs memory
- **Priority:** P0
- **Duplication:** Same "latest assessment for project" concept, two definitions.
- **Evidence:**
  - `src/core/assessment.ts:6 latestAssessmentFor` — max by `completedAt`, tie-break `startedAt`
  - `packages/db/src/repo/assessments.ts:38 listLatestAssessmentForProject`, `:51 getLatestAssessmentSnapshot`, `:20 listAssessmentsForProjects` — `ORDER BY payload->>'completedAt' DESC LIMIT 1`, no `startedAt` tie-break.
- **Impact:** DB says row A is latest, UI re-sort says row B on equal `completedAt`. Assessment status/report can disagree.
- **Fix:** Add secondary `ORDER BY payload->>'startedAt' DESC` to the 3 SQL queries to match `latestAssessmentFor`. Do not remove the in-memory tie-break.
- **Verification:** `vitest run src/core/assessment-latest.test.ts packages/db/src`; add test with two assessments same `completedAt`, different `startedAt` → both layers pick same id.

## P1 — high maintenance risk

### DUP-04: Remediation lifecycle encoded in 4 switches + one history bypass
- **Priority:** P1
- **Duplication:** Same 5-state machine `detected→suggested→approved→implemented→verified`.
- **Evidence:**
  - `src/core/remediation.ts:5 canTransition`, `:52 refreshSuggestion`
  - `src/core/finding-act.ts:85 runtimeAct`, `:159 findingAct` (plus identical fallback literal at `:122-124` and `:182-184`: `resolvedNote ?? "Fix confirmed by automated re-check."`)
  - `src/core/status-display.ts:108 REMEDIATION_STATUS_DISPLAY`
  - Bypass: `src/server/actions/remediation-verify.ts:58 recordStillFailing` hand-spreads `history` instead of `advanceRemediation`; canonical helper `src/server/actions/shared.ts:30 replaceRemediation` + `advanceRemediation` used elsewhere.
- **Impact:** Adding/renaming a state or changing verified copy needs 3–4 edits; bypass breaks history invariant (timestamps/chain).
- **Fix:** (1) Extract `verifiedDescription(finding)` helper, use in both `finding-act.ts` branches. (2) Rewrite `recordStillFailing` to use `advanceRemediation` (or add explicit `appendHistory` helper if staying in same status). (3) Unify exhaustiveness on shared `lookupExhaustive` from `src/core/assert-exhaustive.ts`.
- **Verification:** `vitest run src/core/remediation.test.ts src/core/finding-act.test.ts src/server/action-state.test.ts`; no snapshot/copy change.

### DUP-05: CAPTCHA definition in 3–4 places (AST vs runtime vs applicability)
- **Priority:** P1
- **Duplication:** Same concept "what counts as a CAPTCHA".
- **Evidence:**
  - `packages/analysis-core/src/patterns/multilingual.ts:41 CAPTCHA_TOKEN, CAPTCHA_ALTERNATIVE, PUZZLE_CAPTCHA, PUZZLE_HOSTS`
  - `packages/analysis-core/src/patterns/error-prevention-criteria.ts:26 CAPTCHA_COMPONENT_HOSTS` → `checks/captcha-alternative.ts:25`
  - `packages/analysis-core/src/runtime/custom-checks/captcha-candidates.ts:8 collectCaptchaCandidates`, `:88 isObjectRecognitionCaptchaElement` (+ stringified `BROWSER_COLLECT_CAPTCHA_SRC`)
  - `packages/analysis-core/src/runtime/applicability.ts:64 applicabilityObservationsForPage` re-bootstraps probe via `new Function` + `CAPTCHA_TOKEN.source`
  - `packages/analysis-core/src/patterns/object-recognition-captcha.ts:isObjectRecognitionCaptchaSignal` (comment says "must stay aligned" with DOM twin).
- **Impact:** New provider (e.g. Turnstile variant) added in one list only → AST passes, runtime fails, applicability says `not_applicable`.
- **Fix:** Create single `captcha-config.ts` exporting token regex + host lists + selector list; make AST patterns, `captcha-candidates.ts`, and `applicability.ts` import from it. Keep DOM-stringified copy generated from same constant (or assert equality in test).
- **Verification:** `vitest run packages/analysis-core/src/runtime packages/adapters/src/rgaa`; add test asserting `CAPTCHA_COMPONENT_HOSTS ⊆` runtime selector/host set.

### DUP-06: Snippet/whitespace normalization diverged (dedupe key)
- **Priority:** P1
- **Duplication:** Same `collapse-whitespace + trim + truncate` for finding identity.
- **Evidence:**
  - `packages/analysis-core/src/runtime/dom-location.ts:25 htmlSnippet`
  - `packages/analysis-core/src/runtime/html-validate-runtime.ts:157,165 serializeDocument` (comment admits deliberate copy)
  - `packages/analysis-core/src/runtime/dedupe-runtime-findings.ts:21 normalizeSnippet` (adds `toLowerCase`)
  - Variants in `layout-table-linearization.ts:28`, `dom-hit-rich.ts:41`, `css-off-understandable.ts:11`, `css-disabled-content.ts:25`.
- **Impact:** Dedupe key (`runtimeFindingLocationKey`, `runtimeViolationStillPresent` matches on `selector|snippet`) diverges → same node dedupes in one pass, not another.
- **Fix:** Export `normalizeSnippet` + `truncateSnippet(text, 200)` from `dom-location.ts`; replace all inline `replace(/\s+/g," ")` + `slice(0,197)+"…"` with it. Keep `toLowerCase` only at dedupe-key call site, not in base helper.
- **Verification:** `vitest run packages/analysis-core/src/runtime/dedupe-runtime-findings.test.ts packages/analysis-core/src/runtime/html-validate-runtime.test.ts`.

### DUP-07: Analyzer→engine and analyzer-priority mapped twice
- **Priority:** P1
- **Duplication:** Same 7 `AnalyzerId`s classified twice.
- **Evidence:**
  - `packages/analysis-core/src/contract/finding-types.ts:67 engineFromAnalyzer / engineFor` (`runtime` vs `ast` buckets)
  - `packages/analysis-core/src/runtime/dedupe-runtime-findings.ts:4 ANALYZER_PRIORITY` + `effectiveAnalyzerId` (hardcoded order, default `"ast"`).
- **Impact:** New analyzer defaults to `ast` priority in dedupe but `runtime` in `engineFromAnalyzer` (exhaustive-switch throw) → silent mis-prioritization.
- **Fix:** Single `ANALYZER_META: Record<AnalyzerId,{engine,priority}>` in `contract/finding-types.ts`; make both functions read from it.
- **Verification:** `vitest run packages/analysis-core/src/runtime/dedupe-runtime-findings.test.ts packages/analysis-core/src/check-authority.test.ts`; typecheck must fail if new `AnalyzerId` lacks entry.

### DUP-08: ruleId→CheckId maps ×3 + RENDERED_RULES second source
- **Priority:** P1
- **Duplication:** Same `Record<ruleId, CheckId> + lookup + distinct-ids` shape.
- **Evidence:**
  - `packages/analysis-core/src/runtime/axe-map.ts`, `packages/analysis-core/src/jsx-a11y-map.ts`, `packages/analysis-core/src/runtime/html-validate-map.ts:20 HTML_VALIDATE_TO_CHECK`
  - `packages/analysis-core/src/runtime/html-validate-runtime.ts:28 RENDERED_RULES` re-lists the exact 7 keys of `HTML_VALIDATE_TO_CHECK`.
- **Impact:** Adding analyzer/check touches 3 maps + registries; map says rule→check but runtime runs different set → silent coverage gap.
- **Fix:** Derive `RENDERED_RULES` keys from `HTML_VALIDATE_TO_CHECK_RULE_IDS` (already exported at `html-validate-map.ts:43`) instead of hardcoding; assert `new Set(Object.keys(RENDERED_RULES)) == new Set(HTML_VALIDATE_TO_CHECK_RULE_IDS)` in test. Do not unify the 3 maps into one generic — keep per-engine files.
- **Verification:** `vitest run packages/analysis-core/src/runtime/html-validate-runtime.test.ts` (existing set-equality test at `:197` must pass).

### DUP-09: Org membership index rebuilt per call + permission checked in two layers
- **Priority:** P1
- **Duplication:** Same "role in org / can manage members" logic in domain + action layers.
- **Evidence:**
  - `src/server/org-queries.ts:10 buildOrgMembershipIndex` called fresh in `org-membership.ts:45,82,109`, `orgs.ts:74,130`, `org-queries.ts:50,69,58`
  - `src/server/actions/org.ts:140,162,191` check `canManageOrgMembers` then call `invite/remove/changeOrgMemberRole` which re-derives role and re-throws with different message; role enum `z.enum(["admin","member","viewer"])` at `actions/org.ts:59,70` duplicates `core/rbac:isOrgRole` re-checked in `org-membership.ts:53,106`.
- **Impact:** 2× index build per action; `owner/admin` rule and error messages drift; adding `owner` role diverges UI enum vs domain guard.
- **Fix:** (1) Import `ORG_ROLES` / `isOrgRole` from `core/rbac` into action schemas (no local `z.enum`). (2) Remove action-layer `canManageOrgMembers` pre-check, rely on domain function single check (or vice versa, keep one). Small scope: `actions/org.ts` only.
- **Verification:** `vitest run src/core/rbac.test.ts src/server/workspace.test.ts`; invite/remove/change-member tests still pass with single error message.

### DUP-10: Finding-action preamble (preview-load + permission + project-find) ×3 + double load in tx
- **Priority:** P1
- **Duplication:** Same 4-line preamble in every finding action.
- **Evidence:**
  - `src/server/actions/ai-fix.ts:36 generateAiFixAction`, `src/server/actions/pr.ts:45 createPullRequestAction`, `src/server/actions/remediation-verify.ts:140 verifyRemediationAction`: `getWorkspace() → requireFinding → requireOnFindingProject → preview.projects.find`
  - `src/server/workspace-write.ts:210 withFindingWrite` re-does `findingById + requireOnFindingProject` inside tx (two loads, two permission checks).
- **Impact:** RBAC fix must touch N actions; preview-vs-live divergence (TOCTOU).
- **Fix:** Add `requireFindingContext(preview, findingId)` helper in `actions/shared.ts` returning `{finding, project}`; use in the 3 actions. Leave `withFindingWrite` tx re-check as-is (live-DB authority) but have it accept the already-resolved `projectId` instead of re-resolving from preview.
- **Verification:** `vitest run src/server/action-state.test.ts src/server/assessment-findings.test.ts`; no behavior change, permission-denied tests still pass.

### DUP-11: Entity-write boilerplate clone→mutate→refresh (+ remediation evidence twin)
- **Priority:** P1
- **Duplication:** Same write shape for single + bulk.
- **Evidence:**
  - `src/server/actions/remediation.ts:202 dismissFindingAction`, `:246 bulkDismissFindingsAction`, `src/server/actions/remediation-verify.ts:83 markVerified`, `src/server/actions/requirements.ts:80 clearRequirementOverride`: `cloneProjectRows(...) + findIndex/push + applyRequirementStatusRefresh(rows, project, {controlIds})`
  - Evidence twin: `appendEvidence({kind:"remediation_approved/implemented/verified", summary: remediationEvidenceSummary(...)})` in `server/assessment.ts:136`, `actions/remediation.ts:62`, `actions/remediation-verify.ts:109,240`, `actions/pr.ts:98` (detail shape already diverged: `bulk`, `manual`, `engine`).
- **Impact:** `controlIds` mis-scoped or refresh omitted → stale requirement status; evidence `detail` drift breaks report filters.
- **Fix:** Extract `mutateProjectEntities(projectId, mutateFn, {controlIds})` helper wrapping clone+refresh+return shape; migrate dismiss/bulk/clear-override first. Normalize evidence `detail` via single `remediationEvidenceDetail()` constructor.
- **Verification:** `vitest run src/server/action-state.test.ts src/server/report.test.ts src/core/query-report-view.test.ts`.

### DUP-12: Project-slice scoping rule in memory + SQL
- **Priority:** P1
- **Duplication:** Same "which rows belong to a project" (remediations via finding, not project).
- **Evidence:**
  - `packages/db/src/repo/apply.ts:59 projectScopedSlice`, `:88 snapshotProjectSlice (= structuredClone)`
  - `packages/db/src/workspace-load.ts:148 loadTargetedProjectRuntime` re-implements partly in SQL (`where eq(projectId)`), partly in memory (`:220 filter(f => f.projectId===projectId)`).
- **Impact:** Cross-project leakage fix in one path won't cover the other.
- **Fix:** Export `remediationIdsForProject(findings)` / `projectScopedSlice` predicate from `repo/apply.ts`; call it from `workspace-load.ts` for the in-memory portion. Keep SQL `where` clauses (perf) but assert same predicate in test.
- **Verification:** `vitest run packages/db/src/repo/apply.test.ts`; add test: remediation whose finding is in another project is excluded in both paths.

## P2 — worthwhile consolidation

### DUP-13: Error boundaries ×6 copy-pasted
- **Priority:** P2
- **Duplication:** Identical `useEffect(reportClientError) + <AppErrorCard>` wrapper.
- **Evidence:** `src/app/error.tsx:7`, `src/app/global-error.tsx:8`, `src/app/(app)/error.tsx`, `src/app/(app)/findings/error.tsx`, `src/app/(app)/dashboard/error.tsx`, `src/app/(app)/findings/[id]/error.tsx`; shared card already exists at `src/components/app-error-card.tsx:15`.
- **Impact:** a11y/retry behavior must be updated 6×.
- **Fix:** Add `makeErrorBoundary(tag, description)` factory or `<ReportedError tag description error retry/>` in `src/components/`; rewrite 6 files as one-liners.
- **Verification:** `npm run typecheck && npm run lint`; manual: visit bad route, error card still reports + retries.

### DUP-14: Forms bypass StatefulActionForm + role select duplicated
- **Priority:** P2
- **Duplication:** Same `useActionState + useActionToast + error <p role=alert>`; same role `<select>` options.
- **Evidence:**
  - Canonical `src/components/stateful-action-form.tsx:52`; bypasses `src/components/create-org-form.tsx:21`, `src/components/invite-member-form.tsx:27`, `src/components/create-pr-form.tsx:19`
  - Role options verbatim in `invite-member-form.tsx:56` and `org-members-card.tsx:120` (`canAssignAdmin` semantics)
  - Also `auth-controls.tsx:29` inlines sign-in form duplicated by `sign-in-with-github-button.tsx:16`.
- **Impact:** Pending/error/toast copy diverges; role list drifts.
- **Fix:** Extend `StatefulActionForm` with `extraStatus` slot, migrate the 3 forms; extract `<RoleSelect canAssignAdmin>` + `ORG_ROLE_OPTIONS` constant; make `AuthControls` reuse `SignInWithGitHubButton`.
- **Verification:** `vitest run src/hooks/use-action-toast.test.ts`; typecheck; visual check of the 3 forms (pending label, error alert, toast).

### DUP-15: Offset/span conversion twice + severity-from-engine scattered
- **Priority:** P2
- **Duplication:** Same line/column→offset loop; same "engine hit → severity/confidence" decision in 3 files.
- **Evidence:**
  - `packages/analysis-core/src/jsx-a11y-scan.ts:39 offsetAt` vs `packages/analysis-core/src/runtime/html-validate-runtime.ts:212 offsetForLineColumn` (different column guards); third sibling `parse.ts:117 spanOf / :136 locationOf`
  - `packages/analysis-core/src/runtime/findings.ts:72 severityFromImpact + :93 heuristic-downgrade`, `jsx-a11y-scan.ts:49 severityFromEslint`, `html-validate-runtime.ts:245 findingConfidence + :262 findingSeverity`; downgrade policy `check-authority.ts:72 HEURISTIC_RUNTIME_DOWNGRADE` applied in `findings.ts` but ad-hoc in html-validate.
- **Impact:** Off-by-one shifts `span`/`elementAtOffset`; severity defaults (`serious` vs `moderate` vs `medium`) diverge per engine.
- **Fix:** Share single `offsetAt(text,line,column)` from `parse.ts` or new `text-offset.ts`; route html-validate through it. Centralize `severityFor(engine, raw)` table; keep per-engine raw→level maps as data, not branches.
- **Verification:** `vitest run packages/analysis-core/src/jsx-primitives.test.ts packages/analysis-core/src/runtime/html-validate-runtime.test.ts packages/analysis-core/src/runtime/scan-error.test.ts`.

### DUP-16: Count/href/pagination recipes + preview predicate + evidence tones
- **Priority:** P2
- **Duplication:** Small same-concept helpers repeated; each trivial alone, drift-prone together.
- **Evidence:**
  - Count: `src/core/count-by-status.ts:2 countByStatus` (zero-init) vs `packages/db/src/repo/evidence.ts:71 countEvidenceKindsForProject` (absent-if-zero); callers `requirements/page.tsx:83`, `dashboard/page.tsx:129`, `report-model.ts:46`
  - Href: `src/core/query.ts:57 requirementsStatusHref, :86 evidenceKindHref, :107 reportHref, :121 requirementsPageHref` vs `src/core/finding-list-filter.ts:81 findingsListHref, :89 findingListPaginationQuery, :104 findingListQueryWithPage` (both re-do `page>1` omit-defaults via `pickDefined + buildHref`)
  - Pagination: `src/core/pagination.ts:7 parsePageParam` vs `packages/db/src/repo/evidence.ts:30 sqlPageOffset` (different `NaN/0/"2.9"` handling; `pageMeta :26` clamp has no SQL equivalent)
  - Preview: `Boolean(project.runtimeBaseUrl?.trim())` in `src/core/assessment.ts:38`, `src/core/unable-to-verify-reason.ts:33` (+ `dashboard/page.tsx:134`, `server/assessment.ts:215`)
  - Tones/lists: `src/core/status-display.ts:390 EVIDENCE_DISPLAY` (21 entries must match `packages/db/src/types.ts:100 EvidenceKind`) + `src/core/query.ts:70 EVIDENCE_KIND_FILTER_ORDER` (7-subset); `EvidenceTone` vs `StatusTone` bridged by hand at `:459 EVIDENCE_TONE_BADGE`; severity order in `prioritization.ts:12 SEVERITY_RANK` vs `finding-list-filter.ts:27 SEVERITIES`.
- **Impact:** Zero-vs-absent chips, dropped filter params in deep-links, off-by-one pages, blank-URL semantics, label/tone/filter drift on new evidence kind or severity.
- **Fix (small, separate PRs):** (1) `hasPreviewUrl(project)` in `src/core`; (2) single `countBy(groupBy)` helper with explicit zero-init policy, reuse in evidence count; (3) single list-params↔query codec for findings/requirements hrefs; (4) single `SEVERITY_ORDER` + single `EVIDENCE_META` table as source for union/display/filter-order (or codegen test asserting 21==21==subset).
- **Verification:** `vitest run src/core/count-by-status.test.ts src/core/finding-list-filter.test.ts src/core/status-display.test.ts src/core/pagination.test.ts src/core/query-report-view.test.ts`.

## P3 — minor (do only opportunistically)

- **DUP-17:** Clipboard copy twice (`components/copy-button.tsx:22` vs `components/code-block.tsx:19`; timers/toast diverge) → extract `useCopyText()`. Verify: RTL test on both components.
- **DUP-18:** Loading skeletons hand-rolled (`app/loading.tsx`, `app/(app)/findings/loading.tsx`, `app/(app)/dashboard/loading.tsx`) + `app/not-found.tsx:16` hand-rolls `EmptyState` from `page-primitives.tsx:124` → extract `<PageSkeleton rows>`; reuse `EmptyState`. Verify: typecheck + visual.
- **DUP-19:** Filter-chip wrappers (`evidence-kind-chips.tsx:29` vs `requirements-status-chips.tsx:41`, same `FilterChipList` + `total=reduce` + hidden-empty `<p>` verbatim; `dashboard-status-counts.tsx:20` vs `dashboard-overview.tsx:32` tiles) → generic `<CountChipFilter>` + shared stat tile. Verify: existing component tests.
- **DUP-20:** Trivial `*.filter(x=>x.projectId===)` helpers (`project-visibility.ts:51 evidenceForProject, :58 requirementsForProject, :67 findingsForProject` + `project-scope.ts:60 requirementsInScope, :73 findingsInScope`; `assessment.ts:279` inline copy) → single `rowsForProject(rows,id)`; make `assessment.ts:279` call `requirementsInScope`. Verify: `report.test.ts`, `project-visibility.test.ts`.
- **DUP-21:** `updatedAtById` vs `requirementUpdatedAtById` identical in `packages/db/src/repo/apply.ts:103,110` → single generic. Verify: `apply.test.ts`.
- **DUP-22:** `nullsToUndefined` ×5 in `packages/db/src/repo/mappers.ts:128 rowToEvidence` + two stamp helpers (`newEvidenceRecord :104` vs `stampedNow` in `upsert-guard.ts:40`) → tiny helpers. Verify: `mappers.test.ts`.
- **DUP-23:** Fetch-error strings triplicated (`github-repo-picker.tsx:61` "Could not load repositories." ×3, `assessment-job-status-live.tsx:36` "Could not refresh..." ×3) + `stalledQueueAgeMs/formatStallAge` in `assessment-job-status.tsx:8` duplicating `status-display` → `fetchJson(schema,url,fallback)` + constants; consume central `status-display`. Verify: component tests.
- **DUP-24:** Remediation disclosure/clear/note repeats (`requirement-remediation-actions.tsx:63 vs :95`, `:114 vs :160` verbatim `CollapsibleTrigger`; hand-rolled note `:138` vs shared `reason-note-fields.tsx:6`) → `<ClearAction>`, `<RemediationCollapsible>`. Verify: typecheck + manual.
- **DUP-25:** Write-tx wrappers overlap (`workspace-write.ts:125 withProjectWrite`, `:254 withLockedTenancy`, `:231 withProjectLock`, `:279 withOrgWrite`, `:328 withConnectWrite`, `:210 withFindingWrite`) → unify tx+lock setup, keep persist loops separate. Low ROI, touch only when editing that file. Verify: `workspace.test.ts`, `test:db`.

## Explicitly NOT duplication (do not abstract)

- `OrgSwitcher` vs `ProjectSwitcher` — both correctly delegate to `AutoSubmitSelectForm`.
- `DescribedBadge` in `badges.tsx:33` — already centralizes 8 badges.
- `check.ts` vs `run-check.ts` in `packages/check` — thin CLI entry over pure function, correct.
- Single-field zod schemas in actions — coincidental shape, different domains; unifying creates coupling.
- `WCAG_EXTRA_ONLY_IDS` vs RGAA prefix allowlist (`adapters/src/wcag/presets.ts:10` vs `rgaa/presets.ts:10`) — different product semantics (inclusion vs exclusion); document default instead of unifying.

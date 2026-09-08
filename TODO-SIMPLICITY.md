# TODO-SIMPLICITY

Unnecessary-complexity audit of the whole repo (src/, packages/, scripts/, configs, UI). Every item verified against the actual code (importer counts via `rg`, first-hand reads). Each item is actionable by a coding agent. Application code intentionally untouched.

**Rule of thumb:** the code works. The goal is fewer concepts and fewer lines for the same behavior — not a rewrite. Keep domain-required complexity (evidence append-only, status transition guards, stale-write protection, RBAC, security checks) exactly as it is.

---

## P1 — significant unnecessary complexity

~~### 3. GitHub module fragmentation~~ **DONE**
Helpers in `github.ts` (leaf); App-dependent APIs in `github-access.ts`; `github-helpers.ts` deleted.

~~### 4. Pure/apply duplication in `assessment-status.ts`~~ **DONE**
Single scratch path via `ProjectRows` + `applyRequirementStatusRefresh` (with optional `controlIds`); `applyEntityWrite` / payload-override twins removed. Assessment clears expired exceptions via `clearExpiredExceptions` + `upsertRequirementsById`.

~~### 6. `formatDateTime` re-export from UI~~ **DONE**
All consumers import `@/core/format-datetime`.

~~### 7. Dual evidence wrappers~~ **DONE**
`evidence-payload.ts` deleted; all callers use `appendEvidence` from `project-rows.ts`.

~~### 8. `navAttentionCounts` dead duplicate~~ **DONE**
In-memory counter + test deleted; production uses SQL `countNavAttentionForProject`.

~~### 9. `workspace-load.ts` triplicated loaders~~ **DONE**
`EMPTY_RUNTIME` extracted; `loadTenancyDb` for viewer/org paths; `includeRuntime` and `loadWorkspaceTenancyDbForViewer` removed.

---

## P2 — worthwhile simplifications

### 10. `assessment-job-drain.ts` — 13-line module with exactly one caller

- **Evidence:** `rg -l "assessment-job-drain"` → `src/server/actions/assessment.ts` only (+ own test).
- **Simplification:** inline `shouldDrainAssessmentJobsInline` + `drainAssessmentJobQueue` into `actions/assessment.ts`; move the test assertions there.
- **Verification:** `rg -n "assessment-job-drain" src` → nothing; `npm run test -- src/server/actions/assessment*` passes; dev-mode assessment still runs synchronously.

### 11. Single-function modules + misfiled checkout limits

- **Problem:** one-export, one-importer modules: `sanitizeDownloadFilename` (importer: report route), `pullRequestUrlFromEvidence` (importer: findings page), `assertCheckoutWithinQuota` (importer: `repo-checkout.ts`). Additionally `packages/analysis-core/src/contract/assessment-limits.ts` hosts `maxCheckoutBytes`/`maxCheckoutFiles` (:8–14) whose only consumer is `src/server/resource-limits.ts` — checkout size is a platform concern, not an analysis-engine concern (`maxRuntimePages` genuinely belongs in the contract).
- **Simplification:** inline each single-function module into its only consumer (`pullRequestUrlFromEvidence` → `ai-fix.ts` next to `patchCandidateFromEvidence`, which does the same reverse-scan; move the env-var defaults with `assertCheckoutWithinQuota`). Move the two checkout-limit functions into `repo-checkout.ts`/`resource-limits.ts` and delete them from the contract. Keep `maxRuntimePages` in `assessment-limits.ts`.
- **Verification:** DoD passes; export route still sets `Content-Disposition` (one manual download); `npm run test -- packages/analysis-core` passes.

### 12. `patchCandidateDetail()` wrapper in `ai-fix.ts`

- **Evidence:** `src/server/ai-fix.ts:129` is a rename-only forward to `patchCandidateToDetail`; one internal caller (:170); nothing imports it.
- **Simplification:** call `patchCandidateToDetail(candidate)` directly at :170; delete the wrapper.
- **Verification:** `rg -n "patchCandidateDetail" src` → nothing; `npm run test -- src/server/ai-fix.test.ts` passes.

### 13. Dead exports across `src/server` and `packages/db`

- **Problem:** five zero-caller exports and two test-only exports left behind by refactors. Verified with exhaustive `rg` over `src/`, `packages/`, `scripts/`:
  - `locateViolation` — `src/server/actions/shared.ts:62–71`, zero callers (the similar `locateViolationInProject` in `assessment-findings.ts` is a different function); the import at `shared.ts:8` exists only for it.
  - `getRequirementById` — `packages/db/src/repo/requirements.ts:8–18`, zero callers.
  - `listAssessmentsForProject` — `packages/db/src/repo/assessments.ts:34–45`, zero callers (production uses the plural `listAssessmentsForProjects` at `actions/org.ts:203` and `listLatestAssessmentForProject`).
  - `visibleProjectIds` (`src/server/project-visibility.ts:51–56`) and `resolveVisibleFinding` (:86–99) — only importer is `project-visibility.test.ts`; production uses `visibleProjects`/`isProjectVisible`/`resolveActiveProject` + the DB-path `requireFinding`/`requireOnFindingProject`.
- **Simplification:** delete the dead exports (+ the orphan import) and the two test-only exports with their test blocks.
- **Verification:** `rg -n "locateViolation\b|getRequirementById|listAssessmentsForProject\b|visibleProjectIds|resolveVisibleFinding" src packages` → only unrelated matches; DoD passes.

### 14. Single-caller session wrappers: `loadWorkspaceTenancyDbForViewer` + `sessionWriteContext`

- **Problem:** `src/server/db.ts:16–22` exists only to pin `{ evidenceLimit: 0, includeRuntime: false }` for its single caller (`workspace.ts:103`). `src/server/workspace.ts:125–139` (`sessionWriteContext`) has one caller (`workspace-write.ts:127`) and re-implements the same `auth()` + cookie reading `loadViewerWorkspaceState` already does (:96–100).
- **Simplification:** inline the fixed options at the single call site (also required by item 9); extract one shared `readViewerSession()` used by both the read path and `runProjectWriteTransaction`. ~15 LOC and one duplicated session-read path removed.
- **Verification:** `npm run test -- src/server` passes; read path renders project pages; write path (any action) still resolves the same session.

### 15. `loadLocalEnv()` copy-pasted in 4 scripts (+1 inline variant)

- **Evidence:** identical 7-line function in `scripts/db-migrate.ts:21–27`, `scripts/db-reset.ts:13–19`, `scripts/ensure-org-owner.ts:12–18`, `scripts/e2e-seed.ts:25–31`; 5th inline dotenv variant in `scripts/operations-check.ts:9–10`.
- **Simplification:** one shared `scripts/env.ts`, imported by the five scripts.
- **Verification:** `rg -n "function loadLocalEnv" scripts` → nothing; `npm run db:migrate` still picks up `.env.local`.

### 16. Root `package.json` declares 5 dependencies only `@complyloop/analysis-core` uses

- **Problem:** `aria-query`, `axobject-query`, `fast-glob`, `playwright`, `ssrf-guard` are declared in root `package.json` (:48, :50, :56, :61, :68) but imported _only_ inside `packages/analysis-core/src/` (grep-verified across `src/`, `scripts/`, `e2e/` — nothing imports `"playwright"`; e2e uses `@playwright/test`, declared separately at :76). `packages/analysis-core/package.json` already declares every one of them itself (:23, :24, :27, :30, :31).
- **Simplification:** remove the 5 entries from root `dependencies`. **Keep `axe-core` at root** (:49) — required for analysis-core's peerDep and the runtime `require.resolve("axe-core/axe.min.js")` in `runtime/scan.ts:143`; keep `@types/aria-query` (devDep).
- **Verification:** `npm install` succeeds; `npm run build && npm run test` pass; `npx complyloop-check` still resolves axe-core at runtime (run `npm run check`).

### 17. Dashboard workspace toolbar duplicates the global strip, with a client "gate" patching the overlap

- **Problem:** four identical visibility predicates are computed in both `workspace-context.tsx:54–57` and `dashboard-workspace-toolbar.tsx:20–23`, with the same conditional rendering of `OrgSwitcher`/`ProjectSwitcher`/`ConnectProjectPanel`. `WorkspaceContextRouteGate` (`src/components/workspace-context-route-gate.tsx`, 13-line client component + test) exists solely to unmount the global strip on `/dashboard` because the toolbar re-implements it; the dashboard page prop-drills 5 workspace values (:195–202) that `WorkspaceContext` re-derives from `getWorkspace()` anyway.
- **Simplification:** extract one `WorkspaceSwitchers` server component consumed by both the global strip and the dashboard hero; delete `DashboardWorkspaceToolbar` and `WorkspaceContextRouteGate` (+ test). Alternatively drop the hero toolbar and let the gated global strip serve the dashboard. −60–80 LOC, −2 components, −1 `usePathname` client boundary.
- **Verification:** `npm run test -- src/components` passes; visual smoke: dashboard hero still shows switchers, other pages still show the strip, org/project switching works from both.

### 18. `FindingsCardList` re-implements the card markup `FindingsBulkRow` already renders

- **Problem:** the card inner markup — badge row, reason line, mono location line, identical hover classes — is written twice in `src/components/findings/findings-bulk-list.tsx`: `FindingsBulkRow` (:69–89) and `FindingsCardList` (:244–270). Only the outer `div` vs `li > Link` and the checkbox differ, and the checkbox is already conditional via `canRemediate`.
- **Simplification:** delete `FindingsCardList`; render `FindingsBulkRow` (or a shared `FindingCardBody`) with `canRemediate=false` from `findings-tab-panel.tsx:37–48` and the findings page. −35–45 LOC, −1 exported component.
- **Verification:** findings list renders identically in list and card modes (visual smoke + `npm run test -- src/components/findings`).

### 19. "No project connected" guard block copy-pasted across 4 pages

- **Problem:** identical structure (PageHeader + EmptyState("No project connected", CTA → /dashboard) + hint) in `findings/page.tsx:52–66`, `evidence/page.tsx:44–62`, `requirements/page.tsx:48–63`, `settings/page.tsx:22–39` — copy differs only.
- **Simplification:** one `NoProjectNotice({ title, description, hint })` in `page-primitives.tsx`; collapse each block to a single call. −30–40 LOC.
- **Verification:** each of the 4 pages still shows its empty state when no project is connected.

### 20. `controlForDisplay(controlById(id))` composed by hand in 3 pages, each paying an O(n) catalog scan

- **Problem:** findings page (:103–105), finding detail (:80–83), and dashboard (:273–279) re-assemble the same "raw control → theme for framework" pipeline, while `controlById` (`src/server/workspace.ts:142–147`) does a fresh `Array.find` over the whole shipped catalog per call — O(n) per finding in list rendering.
- **Simplification:** one `displayControl(controlId, project)` helper in `src/server/report.ts`, backed by a `Map` built once from `shippedCatalog()`.
- **Verification:** `npm run test -- src/server` passes; finding pages render identical control titles/themes.

### 21. `check-ids.ts` — 9-line re-export shim creating a third public path

- **Problem:** `packages/analysis-core/src/check-ids.ts` re-exports `CHECK_IDS`/`CheckId` from `check-registry.ts`, and `types.ts:9–12` re-re-exports them — three import paths for the same symbols (`check-authority.ts:1` imports via the shim; `adapters/src/rgaa/catalog-coverage.test.ts:2` via the package path). The package uses wildcard `exports: {"./*": "./src/*.ts"}`, so no path is a stabilized API.
- **Simplification:** delete `check-ids.ts`; point `types.ts`, `check-authority.ts`, and the coverage test at `check-registry.ts` directly.
- **Verification:** `rg -n "check-ids" packages src` → nothing; `npm run test -- packages` passes.

### 22. `selectorOf` inlined in ~21 Playwright probes despite an injectable-helper precedent

- **Problem:** 21 copies of a 3–5 line selector builder across `packages/analysis-core/src/runtime/custom-checks/*.ts` (e.g. `text-spacing-runtime.ts:10–13`, `forced-colors.ts:30–33`, `live-region-updates.ts:13–16` **and** :73–76 — two variants in one file), with divergent behavior (some add `[role]`). The codebase already solved helper-sharing with evaluate callbacks twice (`focus.ts:12–15`, `widget-keyboard.ts:6–19` via source-string injection).
- **Simplification:** one injectable `selectorOf` source constant (the `focus.ts` pattern) used by all probes. **Caveat:** `multilingual.ts:9–15` documents a CSP rationale for inlining `foldAccents`; if strict CSP is the rule, document it for these copies instead and accept them.
- **Verification:** `npm run test -- packages/analysis-core` (incl. custom-checks tests) passes; run one runtime assessment (`runtimeBaseUrl` set) and confirm identical findings.

---

## P3 — minor cleanups (do while touching the file)

### 23. `FirstAssessmentChecklist` takes `hasAssessment` that is hard-coded `false`

- **Evidence:** only call site `dashboard/page.tsx:228` passes `hasAssessment={false}`; the component only renders inside the `!latestAssessment` branch, so `assessmentDone` and the step-3 done-state are dead branches.
- **Simplification:** remove the prop; always render step 3 as pending with the action.
- **Verification:** `npm run test -- src/components/dashboard` passes; new-project dashboard unchanged.

### 24. `error.tsx` and `global-error.tsx` duplicate the reporting effect byte-for-byte

- **Evidence:** both `src/app/error.tsx:22–32` and `src/app/global-error.tsx:22–32` contain an identical `useEffect` (structured JSON `console.error` + `Sentry.captureException`), differing only in the `code` string.
- **Simplification:** extract `reportAppError(error, code)` into a tiny shared module; both boundaries call it.
- **Verification:** `npm run build` passes; throw in dev → both boundaries log + report identically.

### 25. `defaultTab` fallback is a 5-level nested ternary

- **Evidence:** `src/app/(app)/findings/page.tsx:114–129` — a "first non-empty list" chain that is really a loop.
- **Simplification:** iterate `["open","resolved","dismissed"]` slices and take the first with `total > 0` (keep the explicit `by_cause` cluster fallback).
- **Verification:** `npm run test -- src/app` (findings page tests) passes; tab fallback behavior unchanged with empty/non-empty lists.

### 26. UI micro-cleanups: unused avatar exports, single-importer `BadgeWithDescription`, triplicated initial-state literal

- **Evidence:**
  - `src/components/ui/avatar.tsx:88–112` — `AvatarGroup`, `AvatarGroupCount`, `AvatarBadge` have zero importers (file used once, by `auth-controls.tsx:3`). Delete the 3 dead exports.
  - `src/components/badge-with-description.tsx` — 21-line file whose only importer is the adjacent `badges.tsx:1`. Move it into `badges.tsx` as a local helper; delete the file.
  - `{ error: null, message: null }` hand-rolled in `stateful-action-form.tsx:10` and `github-repo-picker.tsx:51` while the canonical `emptyActionMessageState` (`src/server/action-state.ts:9`) is exported but used only by tests. Import the canonical constant in both client components (plain typed object, safe client-side).
- **Verification:** `rg -n "AvatarGroup|AvatarBadge" src` (outside avatar.tsx) → nothing; typecheck + component tests pass.

### 27. Marketing route group has one wrapper layer too many

- **Evidence:** `page.tsx` (wraps `LandingPage`) → `layout.tsx` (wraps `MarketingShell`) → `marketing-shell.tsx`. The `(app)`/`(marketing)` split is justified; the marketing side carries one hop more than needed.
- **Simplification:** inline `MarketingShell`'s markup into `(marketing)/layout.tsx`; render `LandingPage` inline in `page.tsx` (or fold it in). −1 component file.
- **Verification:** landing page renders identically (visual smoke).

### 28. `FindingsTabPanel` drills 9 props including a pre-built ReactNode

- **Evidence:** `findings-tab-panel.tsx:27–52`; call site `findings/page.tsx:265–288` threads `tab, slice, listParams, filtersActive, items, emptyMessage, filteredEmptyState, paginationQuery, paginationLabel` twice; the open tab re-implements the panel inline (:204–258).
- **Simplification (judgment call):** give the panel `basePath`, `query`, and a `renderEmpty(status)` callback; derive `{...listParams, tab}` and the pagination label internally. 9→5 props. Do it when next touching this component, not as churn.
- **Verification:** findings tabs (open/resolved/dismissed/by_cause) render + paginate identically.

### 29. Export-surface sweep: same-file-only exports, dead re-exports, test-only exports in packages

- **Evidence (all verified):**
  - `src/server/assessment-jobs.ts:17–18` — re-exports `AssessmentJobStatus`/`AssessmentJobTrigger`/`AssessmentJobPayload`; no file imports any of the three from this module. Delete both lines.
  - Same-file-only exports (remove `export` keyword): `membershipsForOrg` (`orgs.ts:65`, sole caller :339), `findRemediationForFinding` (`workspace.ts:157`, sole caller :167), `clearExpiredExceptions` / `upsertRequirementsById` in `assessment-status.ts` (callers: assessment + tests), `normalizeGitHubAppPrivateKey` (`github-app.ts:65`, sole caller :74).
  - `packages/analysis-core`: `RUNTIME_ONLY_CHECK_IDS` + `HEURISTIC_CHECK_IDS` (`check-authority.ts:19–27`) and `violationKey` (`theme-conditions.ts:87–89`) are consumed only by their own tests — build the sets in-test from `CHECK_REGISTRY`; un-export `violationKey`. `RUNTIME_GOTO_TIMEOUT_MS` / `RUNTIME_POST_DOM_SETTLE_MS` / `RUNTIME_AUDIT_MOTION_FREEZE_CSS` (`runtime/scan.ts:57–70`) have zero external importers — un-export.
  - `guidanceFor` (`packages/adapters/src/registry.ts:44–46`) is an identity pass-through over `rgaaGuidanceFor`, and `guidance.test.ts:17–19` asserts the pass-through equals its delegate — a tautological test. Delete the assertion (or inline the facade if WCAG guidance never lands).
- **Simplification:** apply the above; for `customProbeCheckIds()` keep the export (load-bearing for `catalog-coverage.test.ts`).
- **Verification:** `npm run typecheck && npm run lint && npm run test` pass.

### 30. Same-file single-caller wrappers: `addConnectedProject`, `withProjectWrite`/`runProjectWriteTransaction`

- **Evidence:** `addConnectedProject` (`connect-github.ts:51–70`) wraps one `newEvidenceRecord` call; sole production caller :191 (test targets it directly). `withProjectWrite` (`workspace-write.ts:205–210`) is a 3-line forward to private `runProjectWriteTransaction` (:114), whose only caller is the wrapper; `withProjectWrite` itself has 13 consumer files — keep the name, drop the two-layer split.
- **Simplification:** inline `addConnectedProject` into `connectGitHubRepo`; rename `runProjectWriteTransaction` → `withProjectWrite` (doc comment moves up) and delete the forwarder.
- **Verification:** `npm run test -- src/server/connect-github.test.ts src/server/workspace-write.test.ts` passes; `rg -n "addConnectedProject|runProjectWriteTransaction" src` → nothing.

### 31. `runtime/scan.ts` — triple SSRF assertion per URL

- **Evidence:** outer loop `scan.ts:436–440` asserts every URL before launch; the in-scanner precheck (:295–299) re-asserts with the same function and error; the route interceptor (:262–285) covers subresources. The in-scanner precheck has a documented TOCTOU rationale; the outer loop adds only an earlier failure.
- **Simplification (judgment call):** delete `scan.ts:437–440`; keep precheck + interceptor. If defense-in-depth before browser launch is deliberate, keep and say so in a comment.
- **Verification:** `npm run test -- packages/analysis-core/src/runtime/scan.test.ts` passes; malicious-URL e2e still blocked.

### 32. `check-registry.ts` — `runtimeOnly` flag is 86% derivable

- **Evidence:** 57 `runtimeOnly: true` entries; 49 already have `authority: "runtime_only"`; the only real signal is the 8 `site_level` exceptions (vs 2 unflagged `site_level` ids: `consistent-lang:806`, `consistent-page-heading:812`).
- **Simplification:** `isRuntimeOnlyCheck` returns `entry.authority === "runtime_only" || Boolean(entry.runtimeOnly)`; keep the flag only on the 8 site-level exceptions with a comment. −49 lines of table noise.
- **Verification:** `npm run test -- packages/analysis-core/src/check-authority.test.ts` passes (it asserts the counts).

### 33. Analysis-core internals: parallel implementations and a duplicated axe shape

- **Evidence:**
  - `theme-conditions.ts:99–129` vs :139–158 — `conditionSpecificViolations` and `conditionSpecificFindings` are the same keyed-diff algorithm; parameterize one helper by `key(item)` (−20 LOC).
  - `heuristic-utils.ts:153–162` (`visitJsxElements`) duplicates the walker in `parse.ts:26–38` (`visitJsxTags`); add an optional element-only predicate to `visitJsxTags` (−10 LOC).
  - `scan.ts:148–169` — `AxeRunResult` hand-replicates `AxeViolationLike` (`findings.ts:26–36`) only so `toAxeViolationLike` (:176–184) can convert; type the evaluate result structurally and delete the converter (−22 LOC).
- **Verification:** `npm run test -- packages/analysis-core` passes.

### 34. `packages/check/bin.js` — tsx fallback for a dev-only scenario

- **Evidence:** `bin.js:15–38` resolves `tsx/cli` and spawns it so `npx complyloop-check` works before `npm run build:check` in this repo; the published package always ships `dist/`.
- **Simplification:** drop the fallback; keep the clear "run build:check" error.
- **Verification:** `npm run build:check && npm run check` passes; `npm run test -- packages/check` (pack smoke) passes.

### 35. `emitLog` "info" branch is dead

- **Evidence:** `observability.ts` supports severity `"info"` but only `reportError`/`reportWarning` are exported and called; `rg -n "reportInfo|emitLog\(\"info\"" src` → nothing.
- **Simplification:** drop `"info"` from the `Severity` union and else-branch.
- **Verification:** `npm run typecheck` compiles; health route still logs warnings.

### 36. `mergeRawFindings` third parameter is derivable — verify or skip

- **Evidence:** `assessment-findings.ts:339` passes `runtimeRan` from a value derivable at the caller (`assessment.ts:229`); but `runtimeFindings.length > 0` is **not** equivalent (runtime can legitimately produce zero findings). Documented judgment call — **agent should verify equivalence or skip**.
- **Verification:** if changed: `npm run test -- src/server/assessment-findings.test.ts src/server/assessment.test.ts`.

### 37. `evidenceExportWindow` / `sqlPageOffset` live in `mappers.ts`

- **Simplification:** move both into `repo/evidence.ts` (their only consumer). Zero behavior change.
- **Verification:** `npm run test -- packages/db` passes.

### 38. Unused `void` params in internal action helpers

- **Evidence:** public actions carry the `useActionState` signature tax (acceptable), but internal `clearRequirementOverrideAction` (`requirements.ts:299`) also takes and voids `_formData`.
- **Simplification:** shrink that helper's signature to the params it uses; leave public action signatures untouched.
- **Verification:** `npm run typecheck && npm run lint` pass.

### 39. Test-only DI params threaded through production signatures (`controls`, `propose`, `scan`)

- **Evidence:** `RunAssessmentOptions.controls` (`assessment.ts:82–89`) and `RefreshRequirementStatusesOptions.controls` (`assessment-status.ts:117–118`) thread a test catalog through 3–4 layers; `RunAiFixOnCheckoutOptions.propose/scan` (`ai-fix.ts:35–43`) exists only for `ai-fix.test.ts`. Legitimate DI, but mockable at the module boundary instead (`vi.mock("@complyloop/adapters/registry")`, the idiom already used in `assessment-status.test.ts`).
- **Simplification (judgment call):** only when next touching these files — mock at the registry boundary and delete the optional params from the four signatures.
- **Verification:** the three test files pass; `npm run typecheck` confirms no other callers of the params.

### 40. `contract/location.ts` type guards — fold into any other contract touch-up

- **Evidence:** `isSourceLocation`/`isDomLocation`/`isSiteLocation` (:8–25) restate `location.kind` discrimination; ~20 call sites could use `.kind` directly at zero cost. Stylistic — the guards do enable narrowing. **Not worth churn on its own.**
- **Verification:** if migrated: `npm run typecheck && npm run test` pass.

---

## Method & explicit non-findings (checked and deliberately NOT flagged)

Verified clean so a future agent doesn't re-litigate them:

- **Root npm dependencies, corrected:** the earlier blanket "all dependencies are used" was wrong in one respect — 5 of them (`aria-query`, `axobject-query`, `fast-glob`, `playwright`, `ssrf-guard`) are used but only by `@complyloop/analysis-core`, which declares them itself (item 16). The rest are genuinely used at root: `diff` (`handoff.ts:2`), `simple-git` (git.ts / connect-github.ts / repo-checkout.ts, with a tested env-sanitizer), `axe-core` (peerDep + `require.resolve` in runtime scan), `sonner`, `next-themes`, `radix-ui`, `ai`, `@octokit/*` (incl. `webhooks-methods`), `dotenv`, `tw-animate-css` (`globals.css:2`), `tailwind-merge`, `clsx`, `lucide-react`.
- **`packages/check/`** is the npm distribution unit (`complyloop-check` bin, own manifest excluding Playwright) — justified as a package; only the bin fallback is flagged (item 34).
- **`contract/` layer in analysis-core (~540 LOC):** deliberately self-contained (`self-contained.test.ts` enforces no upward imports) so db/adapters/core/UI can share statuses/locations without dragging the parser in. Keep; only the `check-ids` hop and checkout-knob misfiling are flagged.
- **`adapters` package:** no fragmentation — `catalog-ids.ts` is a fail-loud validator, not a re-export; `control-theme.ts` has real logic. One micro-trim available: `presetById` rebuilds the presets array per lookup (`registry.ts:20`) — cache the module-level array when next touching the file.
- **`heuristic-utils.ts`:** every export has ≥2 real check consumers; keep (only the `visitJsxElements` overlap is flagged, item 33).
- **`foldAccents` copies in custom-checks:** documented-deliberate (`multilingual.ts:9–15`, CSP rationale) — do not consolidate.
- **`scan.ts` injected `scanner`/`lookup` options:** used by 4 test files — acceptable test seams.
- **`src/server/boundary.ts` vs `src/core/boundary.ts`:** justified (client-safe core, server adds `PublicError` throwing; 14 + 30 importers).
- **In-memory `Db` write-batch + `ProjectWritePayload`:** load-slice + payload is the stale-write-protection mechanism (`upsert-guard.ts`); keep. Status scratch is `ProjectRows` (items 4/7 done).
- **`status-display.ts` (453 LOC):** the documented single source for status UI; keep.
- **`rate-limit.ts` advisory-lock + reset-on-conflict:** documented correctness argument; do not simplify without the atomicity analysis.
- **Advisory-lock + reload loop in `workspace-write.ts`:** each branch documented and load-bearing; only the naming/wrapper layer is flagged (item 30).
- **`withProjectCheckout` / `withRepoCheckout` / `withFixtureCheckout`:** three entry points over one code path with e2e + SSRF + quota wiring; distinct callers each.
- **Assessment job queue SQL (`claimNextAssessmentJob`):** `FOR UPDATE SKIP LOCKED` + lease recovery is standard durable-queue practice.
- **The assessment family split** (`assessment.ts` / `-jobs` / `-status` / `-findings` / `-worker`): distinct responsibilities with multiple consumers; only export-surface and job-drain items flagged (10, 29).
- **`use-action-toast.ts`:** 50 lines, correct pending-flip edge case, tested, `successAction` option has a real consumer — not over-engineered.
- **API routes vs server actions:** no duplication — each route (`/assessment-jobs` polling, `/github/repos` picker fetch, `/internal/jobs/run` worker trigger, `/health`) has a consumer server actions can't serve.
- **`upsertFinding` (single-row):** thin delegate over `upsertFindings` used by `e2e-seed.ts` — acceptable seeding convenience.
- **`e2e-harness.ts`, `worker-auth.ts` (timing-safe compare), `github-tokens.ts` (AES-GCM), webhook signature/idempotency, `resource-limits.ts` SSRF/quota checks:** security/test-infrastructure requirements.
- **`vitest.smoke.config.mts`, route groups, `tsconfig.json`, `.env.example`, `eslint.config.mjs`, `playwright.config.ts`:** lean; no redundancy found.
- **`project-capabilities.ts`, `action-state.ts`, `monitor.ts`, `handoff.ts`, `report-model.ts`, `emptyDb()`:** multiple real callers; fine.

## Suggested execution order

1. **Items 1–2 (P0):** cycle fix + dead-file delete — independent, mechanical.
2. **Item 3 (P1):** GitHub module merge — biggest file-count win, pure import rewiring.
3. **Items 6 + 8 + 13 (quick dead-code):** re-export delete, dead duplicate, dead exports — each independently safe.
4. **Item 16:** root `package.json` trim — one edit + `npm install` + build.
5. **Item 9 + 14 + 15:** loader/session consolidation (workspace-load, db wrappers, scripts env) — related persistence-path cleanups.
6. **Item 5:** personal-org provisioning consolidation — needs `test:db` + fresh sign-in smoke.
7. ~~**Items 4 + 7 (P1):**~~ **DONE** — `ProjectRows` scratch + single `appendEvidence`.
8. **Items 10–12, 17–22 (P2):** file/component consolidations, each independently verifiable.
9. **Items 23–40 (P3):** opportunistic, only while touching those files.

After each change: `npm run lint && npm run typecheck && npm run test && npm run build` (definition of done). For DB-adjacent items add `npm run test:db`; for runtime items run one assessment with `runtimeBaseUrl` set. Run `graft build` after code changes to refresh the repo graph.

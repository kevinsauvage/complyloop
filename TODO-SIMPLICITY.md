# TODO-SIMPLICITY

Unnecessary-complexity audit of the whole repo (src/, packages/, scripts/, configs, UI). Every item verified against the actual code (importer counts via `rg`, first-hand reads). Each item is actionable by a coding agent. Application code intentionally untouched.

**Rule of thumb:** the code works. The goal is fewer concepts and fewer lines for the same behavior — not a rewrite. Keep domain-required complexity (evidence append-only, status transition guards, stale-write protection, RBAC, security checks) exactly as it is.

---

## P3 — minor cleanups (do while touching the file)

### 28. `FindingsTabPanel` drills 9 props including a pre-built ReactNode

- **Evidence:** `findings-tab-panel.tsx:27–52`; call site `findings/page.tsx:265–288` threads `tab, slice, listParams, filtersActive, items, emptyMessage, filteredEmptyState, paginationQuery, paginationLabel` twice; the open tab re-implements the panel inline (:204–258).
- **Simplification (judgment call):** give the panel `basePath`, `query`, and a `renderEmpty(status)` callback; derive `{...listParams, tab}` and the pagination label internally. 9→5 props. Do it when next touching this component, not as churn.
- **Verification:** findings tabs (open/resolved/dismissed/by_cause) render + paginate identically.

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

### 36. `mergeRawFindings` third parameter is derivable — verify or skip

- **Evidence:** `assessment-findings.ts:339` passes `runtimeRan` from a value derivable at the caller (`assessment.ts:229`); but `runtimeFindings.length > 0` is **not** equivalent (runtime can legitimately produce zero findings). Documented judgment call — **agent should verify equivalence or skip**.
- **Verification:** if changed: `npm run test -- src/server/assessment-findings.test.ts src/server/assessment.test.ts`.

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
- **`foldAccents` copies in custom-checks:** documented-deliberate (`multilingual.ts`, CSP) — do not consolidate. **`selectorOf`:** single Node helper; evaluate returns plain refs, then formats outside.
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

# TODO-SIMPLICITY

Unnecessary-complexity audit of the whole repo (src/, packages/, scripts/, configs, UI). Every item verified against the actual code (importer counts via `rg`, first-hand reads). Each item is actionable by a coding agent. Application code intentionally untouched.

**Rule of thumb:** the code works. The goal is fewer concepts and fewer lines for the same behavior — not a rewrite. Keep domain-required complexity (evidence append-only, status transition guards, stale-write protection, RBAC, security checks) exactly as it is.

---

## P3 — minor cleanups (do while touching the file)

### 28. `FindingsTabPanel` drills 9 props including a pre-built ReactNode

- **Evidence:** `findings-tab-panel.tsx:27–52`; call site `findings/page.tsx:265–288` threads `tab, slice, listParams, filtersActive, items, emptyMessage, filteredEmptyState, paginationQuery, paginationLabel` twice; the open tab re-implements the panel inline (:204–258).
- **Simplification (judgment call):** give the panel `basePath`, `query`, and a `renderEmpty(status)` callback; derive `{...listParams, tab}` and the pagination label internally. 9→5 props. Do it when next touching this component, not as churn.
- **Verification:** findings tabs (open/resolved/dismissed/by_cause) render + paginate identically.

~~### 32. `runtimeOnly` flag~~ **DONE** — `isRuntimeOnlyCheck` derives from `authority === "runtime_only" || runtimeOnly`; flag kept only on 8 site_level exceptions.

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

# P0 + P1 Correctness Implementation Plan

> **For agentic workers:** Use executing-plans or implement task-by-task. Steps use checkbox syntax.

**Goal:** Ship all P0 + P1 items from `docs/superpowers/specs/2026-09-08-p0-p1-correctness-design.md`.

**Architecture:** Sequential fixes along the compliance loop — SSRF contract, membership index, dataset-key bug, atomic rate limit, webhook SHA, heuristic cull, switcher extract, status-count unify.

**Tech Stack:** TypeScript, Vitest, Drizzle/Postgres, Next.js server actions, analysis-core.

## Global Constraints

- Domain vocabulary from `domain-model.mdc`; no inventing synonyms.
- Exhaustive switches with `never` default.
- No commit unless user requests.
- Definition of done: `npm run lint && npm run typecheck && npm run test && npm run build`.

---

## Task 1: P0-1 SSRF per-URL + reject absolute routes

**Files:** `packages/analysis-core/src/runtime/scan.ts`, `src/server/actions/runtime-audit.ts`, tests `url-safety.test.ts`, `runtime-audit.test.ts`

- [ ] In `scanRuntime`, after building urls, assert each with `assertSafeRuntimeUrl`; return unsafe error shape on failure
- [ ] In `parseRoutes`, reject absolute `http(s)://` strings
- [ ] Verify: `npx vitest run packages/analysis-core/src/runtime/url-safety.test.ts` + runtime-audit tests

## Task 2: P0-2 OrgMembershipIndex

**Files:** `src/server/orgs.ts`, `src/server/orgs.test.ts`

- [ ] Add index helper; route lookup helpers through it
- [ ] Unit test index ≡ filter scan
- [ ] Verify: orgs tests

## Task 3: P1-1 error-prevention dataset keys

**Files:** `packages/analysis-core/src/runtime/custom-checks/error-prevention.ts`, patterns + tests

- [ ] Pass `ERROR_PREVENTION_CONFIRM_DATASET_KEYS`
- [ ] Round-trip + form-with-data-review-step not flagged
- [ ] Verify: error-prevention tests

## Task 4: P1-2 atomic rate limit

**Files:** `src/server/rate-limit.ts`, `src/server/rate-limit.test.ts`

- [ ] Conditional UPDATE increment; rowCount for limit
- [ ] Concurrent writer test if missing
- [ ] Verify: rate-limit tests

## Task 5: P1-3 webhook PR SHA

**Files:** `src/server/webhook.ts`, `src/server/webhook.test.ts`

- [ ] Same 40-hex validation for PR head.sha
- [ ] Test not-a-sha → handled false

## Task 6: P1-4 drop heuristics

**Keep:** pointer-gesture, motion-actuation, audio-description-track, captions-live, p-as-heading  
**Drop:** focus-context-change, input-context-change, sensory-characteristics, error-suggestion, image-of-text

- [ ] Unregister + delete modules/tests/orphaned helpers
- [ ] Coverage/catalog green; light architecture.md skim

## Task 7: P1-5 AutoSubmitSelectForm

**Files:** new shared component; org/project switchers; RTL tests

## Task 8: P1-6 countByStatusMap

**Files:** `src/core/count-by-status.ts`, dashboard + requirements pages, tests

## Task 9: Wrap-up

- [ ] Full gate commands
- [ ] Move P0/P1 items to Completed in `todo.md`

# TODO — full audit follow-ups

Source: full audit run via `docs/prompts/master.md` (2026-10-21) on `main` @ `401cd12d`; the same day's fix pass closed every P0/P1 item except those below. Re-verify before fixing. Ask first for `drizzle/`, `src/core/`, `packages/analysis-core/src/contract/`.

**Size:** `S` ≈ under 1h, one file · `M` ≈ half a day, a few files + tests · `L` ≈ 1+ day or needs design. Sizes are rough estimates, not measured.

## Verify in CI (could not run locally)

- [ ] **Chromium sandbox on the runners.** `scan.ts` now launches with `chromiumSandbox: true` and a minimal `env`. Both `assessment-worker.yml` and the CI e2e job set `kernel.apparmor_restrict_unprivileged_userns=0`. Check that the first e2e run and the first worker drain launch the browser. If they fail with "No usable sandbox", that sysctl step is the place to look.
- [ ] **New `test:db` cases.** `evidence-append-only.test.ts` (erasure of a disconnected project), `orgs-concurrency.test.ts` (cross-tenant slug), `projects-lookup.test.ts` (`updateProject` keeps delivery-owned fields). Run in the db-integration job.
- [ ] **Worker gate SQL.** The `assessment-worker.yml` depth query now also counts lapsed temporary exceptions. Check one scheduled tick's "Check queue depth" step.
- [ ] **e2e print click** (`e2e/compliance-loops.spec.ts`): proves the report's print button works under the CSP.

## Remaining

- [ ] `L` **Split the 4 largest files** (approved, not started): `assessment.ts`, `check-registry.ts`, `scan.ts` and server `assessment-jobs.ts`. Behaviour-preserving moves only.
- [ ] `M` **Enable `noUncheckedIndexedAccess`** (approved, not started). About 60 errors, mostly in tests (`assessment.test.ts`, `handoff.test.ts`, `fixes.test.ts`).
- [ ] `L` **Split the browser step from the DB/App-key job** (approved, not started). Propose the design first: a separate workflow job with an artifact hand-off, or a child process under a separate OS user with no secrets.

## Verify in CI (this pass)

- [ ] Migration `drizzle/0008_membership_github_user_id.sql`, plus the new `test:db` id-binding case in `orgs-concurrency.test.ts`.
- [ ] `npm run verify:gate` (only `vitest` and `tsc` ran after the last changes).

## Needs a human decision

- [ ] Extend the patch gate beyond an a11y re-scan?
- [ ] Accept dynamic marketing pages (CSP nonce)?

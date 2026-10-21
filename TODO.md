# TODO — full audit follow-ups

Source: full audit run via `docs/prompts/master.md` (2026-10-21) on `main` @ `401cd12d`; the same day's fix pass closed every P0/P1 item except those below. Re-verify before fixing. Ask first for `drizzle/`, `src/core/`, `packages/analysis-core/src/contract/`.

**Size:** `S` ≈ under 1h, one file · `M` ≈ half a day, a few files + tests · `L` ≈ 1+ day or needs design. Sizes are rough estimates, not measured.

## Verify in CI (could not run locally)

- [ ] **Chromium sandbox on the runners.** `scan.ts` now launches with `chromiumSandbox: true` and a minimal `env`. Both `assessment-worker.yml` and the CI e2e job set `kernel.apparmor_restrict_unprivileged_userns=0`. Check that the first e2e run and the first worker drain launch the browser. If they fail with "No usable sandbox", that sysctl step is the place to look.
- [ ] **New `test:db` cases.** `evidence-append-only.test.ts` (erasure of a disconnected project), `orgs-concurrency.test.ts` (cross-tenant slug), `projects-lookup.test.ts` (`updateProject` keeps delivery-owned fields). Run in the db-integration job.
- [ ] **Worker gate SQL.** The `assessment-worker.yml` depth query now also counts lapsed temporary exceptions. Check one scheduled tick's "Check queue depth" step.
- [ ] **e2e print click** (`e2e/compliance-loops.spec.ts`): proves the report's print button works under the CSP.

## Remaining

- [ ] `L` **Split files over 300 lines** (deferred by choice): 38 files, excluding catalog and tests. Start with `assessment.ts` (935), `check-registry.ts` (869) and `scan.ts` (~860).
- [ ] `L` **Split the browser step from the DB/App-key job** (the Chromium P0's long-term fix). The sandbox and env scrub contain a renderer exploit today; the topology change is a separate decision.
- [ ] `S` **Unchecked `EvidenceKind` casts** at `packages/db/src/repo/mappers.ts:168` and `repo/evidence.ts:178`. `EvidenceKind` is a bare union, so `isOneOf` needs an `EVIDENCE_KINDS` array in the contract (ask first).
- [ ] `S` **Legacy orphaned evidence.** Evidence of projects disconnected _before_ this fix has no org link (no `detail.orgId`), so deleting its org still leaves it, against the privacy page's "erases everything". Needs a one-off decision: a manual erase by project id on request, or accept.

## Needs a human decision

- [ ] When a resolved finding reappears, should it become a new Finding (current behaviour) or re-open with its history intact (domain-model-check #8)?
- [ ] Disconnecting cascade-deletes exceptions and dismissals (only evidence keeps the history). Acceptable?
- [ ] Bind invites to the GitHub numeric id? Logins can be recycled, and unclaimed invites live 30 days.
- [ ] May `member` record exceptions and human passes (`project.remediate`)?
- [ ] Keep the `core/filter-params.ts` / `core/display.ts` barrels (47 imports; amend `code-quality.mdc`) or remove them?
- [ ] Enable `noUncheckedIndexedAccess`?
- [ ] Should `not_applicable` count in the `passRate` denominator?
- [ ] Cap full-history loads now (reports and exports read every finding ever) or measure first? Accept dynamic marketing pages (CSP nonce)?
- [ ] Reword "no `use client` above `@/server/*`" to exempt server actions?
- [ ] Extend the patch gate beyond an a11y re-scan?
- [ ] Keep the `diff` dependency for its single consumer (`handoff.ts`)? Move `tw-animate-css` to devDependencies?

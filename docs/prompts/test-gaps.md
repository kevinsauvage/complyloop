# Test gap analysis and fill

**Mode:** edits (tests only) · **Scope:** `{{SCOPE}}` (default: `git diff main...HEAD`; or a module path)

Find missing or weak tests and add them. Do not change production code to make tests easier — report testability problems instead.

## Priorities (highest risk first)

1. Status transitions and exhaustive-switch logic (every status, including illegal transitions rejected).
2. Evidence rules: insert-only, provenance recorded, stale-write guard, `automated` vs `human_review` source.
3. Authorization and tenancy: another org's id must be denied; unauthenticated denied.
4. Webhook and job paths: signature failure, duplicate delivery id (idempotency), malformed SHA, re-run of a job.
5. SSRF/URL validation: private ranges, redirects, absolute URLs in routes.
6. Analysis engine rules: one positive and one negative fixture per rule; fixtures live in `src/test-fixtures` or the package's own fixtures.
7. AI output handling: invalid/hostile model output rejected by the Zod schema; AI never changes status.
8. UI behavior: states (empty, loading, error), keyboard paths (`j`/`k` queue nav), queried by accessible role/name.

## Method

1. `npm run test:coverage` (or read `vitest.config.mts` thresholds) to see uncovered branches in scope.
2. Read existing tests next to the code and match their style (colocated `*.test.ts(x)`, RTL role queries, no CSS-class selectors).
3. Look for **weak** tests too: assertions that cannot fail, over-mocking that bypasses the logic under test, snapshots standing in for assertions.
4. Write tests for behavior, not implementation. One reason to fail per test; name them after the behavior.
5. Mutation check: temporarily break the production line (e.g. flip a condition) and confirm a test fails; restore it.
6. DB-backed behavior belongs in the `test:db` set (needs `DATABASE_URL`); say if you could not run it.

## Output

Gaps found (ranked) · tests added (file → cases) · weak tests fixed · coverage delta · untestable areas and why. Finish with `npx vitest run <files>` then `npm run verify:gate`.

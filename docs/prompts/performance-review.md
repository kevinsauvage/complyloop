# Performance review

**Mode:** read-only · **Scope:** `{{SCOPE}}` (route, query, job, or `git diff main...HEAD`)

Find real performance problems backed by evidence. Do not edit code or optimize on instinct. Check Next.js behavior in `node_modules/next/dist/docs/` before asserting it.

## Check

1. **Database** — N+1 loops (query inside `map`/`for`), missing index for a `WHERE`/`ORDER BY`/join (compare with `drizzle/` and `packages/db` schema), unbounded `SELECT` without `limit`/pagination, `SELECT *` on wide rows, queries repeated within one request (dedupe with `React.cache` or one loader), long transactions holding locks.
2. **Rendering** — data fetched sequentially that could be parallel (`Promise.all`), waterfalls across nested Server Components, missing `Suspense` streaming for slow sections, work done on the client that belongs on the server, `"use client"` placed too high.
3. **Caching** — correct use of Cache Components / `use cache`, `cacheTag`/`revalidate` after mutations (stale data is a correctness bug too); no accidental dynamic opt-out of whole routes.
4. **Bundle** — heavy client imports (charts, markdown, date libs), whole-library imports, server-only code leaking to the client, missing `next/dynamic` for rarely used UI; run `npm run build` and compare route sizes; see the bundle check in `verify:gate`.
5. **Client** — list rendering without virtualization/pagination on large finding sets, effects that re-run per render, inline object/function props defeating memoization _only where profiled_, layout shift from images/fonts without dimensions.
6. **Jobs** — assessment worker: clone depth, repeated parsing of the same file, unbounded concurrency, memory growth on big repos, Playwright launch per route instead of per run, timeouts.
7. **Network** — redundant GitHub API calls (use conditional requests/ETags, batching), missing timeouts and backoff.

## Output

```text
[IMPACT: high|med|low] path/file.ts:LINE — problem
  Evidence: query plan, measurement, bundle size, or code path proving it
  Estimated effect: what gets slower and at what scale
  Fix: minimal direction · Verify: how to measure before/after
```

Rank by user-visible impact. Label guesses `[HYPOTHESIS — measure first]`. Don't recommend micro-optimizations with no measured or scaled-up case.

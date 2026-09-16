# Single Scan Route + Self-Fetch Drains + GitHub Actions Sweep

**Date:** 2026-09-15
**Status:** Approved design (pending implementation plan)
**Scope:** Production assessment execution topology on Vercel Hobby plan

## Problem

Two structural issues in the current production setup:

1. **Scans execute inside whichever route invoked them.** The `after()`
   continuations in `runAssessmentAction` and the GitHub webhook route import
   the full scan stack (`runAssessmentJobBatch` → Playwright + sparticuz
   Chromium). Vercel bundles each route as a separate function, so every route
   that can trigger a scan must carry the `@sparticuz/chromium/bin` assets via
   `outputFileTracingIncludes`. This has already failed twice in production
   (`browsers.json` missing; `@sparticuz/chromium/bin` missing) and breaks
   silently whenever a new trigger route is added.

2. **The daily Vercel cron is a weak backstop.** Hobby plans force a daily
   schedule. A killed `after()` task leaves a job `running` until its 30-min
   lease expires; lease recovery only happens on the next claim, which on a
   quiet project may not occur until the daily cron — a worst-case orphan
   window of ~24h.

User constraints: stay on the free/Hobby plan; keep everything self-contained
on Vercel (no external dispatcher or worker services).

## Design

`/api/internal/jobs/run` becomes the **only** route whose module graph reaches
the scan stack. Trigger sites only enqueue and notify; the worker route runs
the scan.

```
Trigger sites (dashboard action, webhook, findings re-verify)
  └─ enqueue job (Postgres, unchanged)
  └─ after(() => scheduleAssessmentDrain())   ← new helper
        ├─ dev / e2e harness → inline drain (unchanged behavior)
        └─ production        → self-fetch POST {AUTH_URL}/api/internal/jobs/run?limit=1
                               with Bearer WORKER_SECRET (never throws)
Backstop: GitHub Actions cron */15 → same route, ?limit=10&concurrency=2
```

### Key decisions

- **One bundled scan function.** `outputFileTracingIncludes` collapses to a
  single entry (`/api/internal/jobs/run` gets chromium binaries +
  `browsers.json`). The per-route sparticuz entries for `/api/github/webhook`,
  `/dashboard`, and `/findings/*` are deleted. The class of
  "new trigger route forgot the include" failures becomes structurally
  impossible: only the worker route can launch a browser, and it is fully
  traced.
- **No Vercel Cron.** `vercel.json` `crons` is deleted. The backstop becomes a
  GitHub Actions scheduled workflow hitting the same authenticated endpoint
  every 15 minutes, cutting the orphan-recovery window from worst-case ~24h to
  ≤15 min. The `CRON_SECRET == WORKER_SECRET` coupling disappears; `WORKER_SECRET`
  alone gates the route. `CRON_SECRET` becomes unused and may be removed from
  the environment.
- **Self-fetch instead of in-process drain.** Trigger sites fetch their own
  worker endpoint rather than running the scan in the invoking function. The
  origin function idles while awaiting; cheap under Active CPU pricing. If the
  self-fetch fails or the function is killed, the job stays
  `queued`/`running`, and the GHA sweep reclaims it within ≤15 min via the
  existing lease-recovery path.
- **Dev/e2e unchanged.** `shouldDrainAssessmentJobsInline` behavior is
  preserved via the new helper so the dev path stays synchronous.

### Accepted trade-off

Next's file tracing follows dynamic imports, so trigger routes may still
*carry* scan code in their bundles — but they never *execute* it. Residual
bundle bloat only; missing binaries on trigger routes are now irrelevant.

## File Changes

| File | Change |
|---|---|
| `src/server/assessment/assessment-job-inline.ts` | Add `scheduleAssessmentDrain()` returning `Promise<string \| undefined>`: in dev/e2e it dynamically imports and awaits the inline drain and returns its user-facing message; in production it registers the `after()` non-throwing self-fetch (`Bearer WORKER_SECRET`, logs `assessment_opportunistic_drain_failed` on failure) and returns `undefined`, so the caller uses the "queued" copy. Static imports are env-only — trigger sites never statically import the runner, keeping the scan stack out of their traced bundles. |
| `src/server/actions/assessment.ts` | Replace `after(() => drainSingleAssessmentJobOpportunistically())` with `scheduleAssessmentDrain()`. |
| `src/app/api/github/webhook/route.ts` | Same replacement (both branches). |
| `next.config.ts` | Collapse `outputFileTracingIncludes` to the single worker-route entry. |
| `vercel.json` | Delete `crons`. |
| `.github/workflows/assessment-sweep.yml` | New: `schedule: */15`, `workflow_dispatch`, `concurrency: assessment-sweep`, one curl step (15s connect timeout) against the deployed production URL — `PROD_URL` repo variable or derived from `AUTH_URL` — with `WORKER_SECRET`. |
| `docs/vercel.md` | Cron section → GHA sweep; remove `CRON_SECRET` coupling. |
| `.env.example` | `CRON_SECRET` marked removed/optional; `WORKER_SECRET` unchanged. |

The uncommitted `scan-error.ts` improvement (actionable sparticuz bundle
error) is orthogonal and stays.

## Error Handling & Recovery

- Self-fetch failure / killed function → job remains `queued`/`running` →
  existing lease recovery (`recoverExpiredLeases` on claim) → GHA sweep
  reclaims within ≤15 min.
- Auth: GHA sweep uses the same `WORKER_SECRET` bearer the route already
  validates. One secret, one auth path.
- `maxDuration = 300` unchanged. Opportunistic drains are `limit=1`; the sweep
  is `limit=10&concurrency=2` (as today).

## Testing & Verification

- Update `assessment.test.ts` and `route.test.ts` mocks for the new helper;
  unit-test `scheduleAssessmentDrain` branch behavior (mocked fetch).
- Targeted: `npx vitest run <touched-file>`.
- Gate: `npm run lint && npm run typecheck && npm run test && npm run build`;
  add `npm run test:e2e` (drain path changed).
- Post-deploy: verify the worker function bundle contains
  `@sparticuz/chromium/bin`; one manual assessment succeeds end-to-end; one
  GHA sweep run hits the endpoint (check function logs).

## Operational Notes

- GitHub Actions scheduled workflows have known start-delay variance
  (typically seconds to a few minutes under load); acceptable for a backstop
  whose target window is 15 minutes. Manual/`workflow_dispatch` runs are
  immediate and serve as an operator drain button.
- The sweep fires `limit=10&concurrency=2` so a backlog accumulated during an
  outage drains in a few ticks; serial-per-project claiming prevents bursts
  from stacking scans of one project.

## Assumptions

- `[ASSUMPTION]` `AUTH_URL` is set in production (required per
  `docs/vercel.md`); the self-fetch uses it as base URL.
- `[ASSUMPTION]` The findings re-verify path enqueues through the same
  action/helpers (config comment suggests so); implementation confirms before
  touching it.

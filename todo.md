# Todo

Backlog generated from a project audit (2026-09-02). Each item answers **what** to do, **why** it matters, and **where** the work lives.

---

## P0 — Go-live blockers

### 1. Run the deploy checklist on a real environment

- **What:** Execute every step of the go-live checklist against a production (or staging) deployment and confirm each one works.
- **Why:** The checklist has never been exercised end-to-end; we can't claim production readiness until it passes on real infrastructure.
- **Where:** `docs/deploy.md` (checklist at top).

### 2. Do a backup & restore drill

- **What:** Run `npm run ops:backup`, then restore the dump into a fresh database and verify the app works against it.
- **Why:** A backup that has never been restored is not a backup. Evidence data is append-only and irreplaceable.
- **Where:** `scripts/` ops backup command, Postgres instance from `docs/deploy.md`.

### 3. Wire Sentry alerting, not just error capture

- **What:** Create Sentry alert rules (error spikes, worker failures, webhook failures) and route them to a channel someone actually reads.
- **Why:** A DSN without alerts means production errors are recorded but nobody is notified.
- **Where:** Sentry project settings; intended alerts are listed in `docs/deploy.md` (~lines 152–158).

### 4. Add an uptime probe and lock down prod flags

- **What:** Point an uptime monitor at `/api/health` and verify `E2E_AUTH_ENABLED` is unset in production.
- **Why:** Without a probe, downtime is discovered by users. The e2e auth flag bypasses real login and must never reach prod.
- **Where:** `src/app/api/health/route.ts`; deployment environment variables.

---

## P1 — Hardening

### 5. Actually call `pruneRateLimitBuckets`

- **What:** Schedule `pruneRateLimitBuckets` from the worker (or a cron), not only from tests.
- **Why:** Rate-limit buckets grow forever in the database — a slow leak that eventually bloats storage and queries.
- **Where:** `src/server/rate-limit.ts:60` (definition); wire the call into `src/server/assessment-worker.ts` or an ops cron.

### 7. Refuse placeholder secrets

- **What:** Remove the `AUTH_SECRET` fallback default from docker-compose and make prod boot fail on known placeholder values (`replace-me`, `e2e-secret-change-me`).
- **Why:** A default secret in a copy-pasted deploy silently breaks session security.
- **Where:** `docker-compose.yml` (lines 26, 55), `docs/deploy.md` (~line 85), `src/auth-secret.ts`.

### 8. Stop health-check failures flooding Sentry as errors

- **What:** Downgrade the "database down during health probe" report to a warning or rate-limit it.
- **Why:** An uptime probe hitting a downed DB every few seconds buries real errors under thousands of identical events.
- **Where:** `src/app/api/health/route.ts:31` (`reportError` with `health_database_down`).

## P2 — Product gaps (spec follow-ups)

### 11. Cluster → one PR

- **What:** Let a user open a single pull request that fixes all findings in a root-cause cluster, instead of one PR per finding.
- **Why:** Clusters exist precisely because one shared component causes many findings; fixing them one PR at a time is busywork the spec (§17) says we should remove.
- **Where:** `src/server/actions/pr.ts` (currently takes a single `findingId`), `src/core/root-cause.ts`; noted as a follow-up in `docs/ai/finding-flow.md:133`.

### 12. Auto-propose fixes at assessment time

- **What:** After an assessment, automatically draft safe deterministic fixes so findings arrive with a suggested remediation attached.
- **Why:** Shortens the loop from "found" to "fixed"; suggestions still require human approval, so it fits the human-in-the-loop rule.
- **Where:** Assessment pipeline in `src/server/assessment.ts` + fix engine in `packages/analysis-core/src/fixes.ts`; listed in `docs/ai/finding-flow.md:134`.

## P3 — Post-MVP (parked deliberately)

### 14. Sources beyond GitHub

- **What:** Support GitLab/Bitbucket (or plain git URL) as project sources.
- **Why:** Spec §5 plans multiple connectors; today `ProjectSource` is GitHub-only, which limits who can adopt the product.
- **Where:** `src/core/project-types.ts:27`, `src/server/` GitHub integration behind an interface.

### 15. Frameworks beyond accessibility

- **What:** Add a second compliance framework (e.g. SOC 2 or a custom checklist) through the adapter system.
- **Why:** Proves the domain model is genuinely framework-agnostic (spec §26) before more a11y-specific assumptions creep in.
- **Where:** New adapter under `src/adapters/`, registered in `src/adapters/registry.ts`.

---

_Priorities: P0 = blocks a trustworthy production launch. P1 = fix soon, cheap now and expensive later. P2 = product value from the spec. P3 = intentionally after MVP._

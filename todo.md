# TODO — ComplyLoop

One list, priority-ordered. Each item says **what** we'll build and **why** it matters.
Verified against the codebase on 2026-09-02 (supersedes `todo.md` and `nomotron-todo.md`).

**Definition of done for any change:** `npm run lint && npm run typecheck && npm run test && npm run build`

---

## P0 — Go-live blockers (nothing ships until these are done)

- [ ] **Run the go-live checklist in `docs/deploy.md` on a real environment**
      What: provision production Postgres + run migrations, set stable `AUTH_SECRET`/`AUTH_URL`, create the production GitHub App (Contents R/W, PR R/W, Checks R/W, Metadata R) + webhook secret, start at least one `npm run worker` process.
      Why: the app runs in dev today; none of this is confirmed for production, and the worker is mandatory — without it assessments never run.

- [ ] **Tested backup & restore drill**
      What: restore a `pg_dump` to staging once, verify `/api/health` and sign-in afterwards; schedule daily dumps with an off-host copy (`npm run ops:backup` exists, the drill isn't evidenced).
      Why: evidence is append-only compliance data — an untested backup is not a backup.

- [ ] **Sentry alerting wired, not just a DSN set**
      What: alert on unhandled exceptions, `webhook_clone_failed`, `workspace_missing`, `assessment_job_failed` evidence, and growing job queues.
      Why: silent failures mean users wait forever on assessments with no signal to the team.

- [ ] **Uptime probe → `GET /api/health`, and `E2E_AUTH_ENABLED` unset in prod**
      What: point the load balancer at the health endpoint (503 when DB is down); confirm the e2e auth bypass env var is not set on the deployment.
      Why: the e2e flag skips GitHub App enforcement and clones a fixture tree — leaving it on would be a security hole.

## P2 — Completeness & UX

- [ ] **Remediation history view** — visualize the `RemediationHistoryEntry` timeline on a finding. Why: teams need to see who approved/verified what, and when.
- [ ] **E2E coverage for webhook-driven flows** — push/PR event → re-assess → regression → Check Run, in Playwright. Why: this is the continuous-monitoring promise; it's currently untested end-to-end.

# ComplyLoop product backlog

This backlog is based on the product specification and the current implementation,
not on generic SaaS checklists. The core RGAA/WCAG MVP is substantially present:
GitHub projects, AST and optional runtime assessments, remediation and verification,
append-only evidence, exports, RBAC, PR Check Runs, and regression alerts.

## Priority definitions

- **P0 — launch blocker:** Required before a multi-tenant production pilot where
  GitHub webhooks and assessments must be dependable.
- **P1 — pilot readiness:** Important to make the pilot useful, supportable, and
  auditable for real teams; schedule after P0.
- **P2 — product expansion:** Valuable roadmap work that should follow validated
  demand rather than delay the accessibility MVP.

## P0 — launch blockers

- [ ] **Move assessments and PR work to durable background jobs.** Webhook and
  server-action requests currently clone repositories, run AST/Playwright scans,
  persist results, and sometimes post Check Runs inline. Add persisted job state,
  idempotency, retry/backoff, per-project concurrency control, cancellation, and
  a worker. A webhook should acknowledge quickly and the UI should show queued,
  running, failed, and completed assessment states.
  - Completion: duplicate deliveries and worker retries never create duplicate
    assessments/evidence; failed jobs are visible and retryable; long scans do
    not depend on request timeouts.

- [ ] **Add production-grade distributed limits and resource quotas.** Current
  expensive-action rate limits are process-local and reset on restart. Enforce
  limits across instances for assessment, clone, AI, and webhook workloads, and
  bound repository size, checkout duration, scan duration, runtime pages, and
  concurrent browser sessions.
  - Completion: limits remain effective with multiple app instances and abusive
    or oversized repositories cannot exhaust shared worker capacity.

- [ ] **Define and automate an operational recovery runbook.** The deployment
  guide documents backups and a manual restore drill, but launch needs owned,
  scheduled backups/PITR, encrypted secret management and rotation, alerts for
  failed jobs/webhooks, and a tested restore procedure with an explicit RPO/RTO.
  - Completion: staging restore is exercised on a schedule and on-call alerts
    distinguish GitHub, database, queue/worker, and runtime-audit failures.

## P1 — pilot readiness

- [ ] **Make runtime coverage representative of the application.** Runtime
  audits currently use manually entered routes and default to `/`; protected,
  parameterized, and important user-journey pages can be missed. Add route
  discovery/import, authenticated audit setup that keeps credentials out of
  evidence, route tags/ownership, and clear coverage reporting.
  - Completion: each assessment records intended, scanned, skipped, and failed
    routes so `unable_to_verify` has an actionable reason.

- [ ] **Deliver regression notifications where teams work.** Regressions are
  stored as dashboard alerts and PR Check Runs, but there is no configurable
  notification policy. Add project/org policies and initial GitHub/Slack/email
  delivery, with deduplication, acknowledgement, and escalation for unresolved
  failures.

- [ ] **Replace whole-store read/modify/write persistence with scoped data
  access.** Mutations load the complete database and use one global Postgres
  advisory lock before synchronizing payload tables. This is safe for the MVP
  but will serialize unrelated organizations and make evidence history
  increasingly expensive. Introduce repository methods and targeted,
  tenant-scoped transactions while preserving append-only evidence.
  - Completion: a project assessment does not load or lock unrelated tenants,
    and concurrent work on separate projects proceeds safely.

- [ ] **Strengthen audit-evidence integrity and retention.** Evidence is
  insert-only today, which is an excellent base. Add actor/request provenance,
  immutable assessment-input metadata (commit, control version, engine version),
  export manifest/hash, retention policy, and a deletion/anonymization policy
  that preserves the required audit trail.

- [ ] **Complete team-administration workflows.** Invitations are currently
  claimed when a matching GitHub login eventually signs in. Add an actual invite
  delivery/acceptance experience, expiration and resend/revoke handling,
  ownership transfer, and an organization access-review view.

- [ ] **Make the CI check workflow an enforcement example.** The repository’s
  `complyloop-check` workflow intentionally scans known-bad test data and
  continues on error, so it demonstrates the command but does not enforce a
  real application’s accessibility gate. Provide a production template that
  takes a target path, baseline/ratchet policy, SARIF or PR annotations, and
  fails only on agreed new or unresolved findings.

- [ ] **Harden tenant-boundary defense in depth.** Keep the existing
  application-level RBAC, then document and test the database/service account
  boundary, authorization logging, token/key rotation, and least-privilege
  access paths. Prioritize an external security review before handling customer
  evidence at scale.

## P2 — product expansion

- [ ] **Expand the framework catalogue deliberately.** Version the RGAA/WCAG
  adapter and add an adapter contract for future frameworks. Start with the
  framework/control metadata, import versioning, migration of scoped controls,
  and evidence that names the exact control version assessed.

- [ ] **Broaden analysis beyond the current React/Next JSX focus.** Add
  configuration and test analysis where deterministic checks are feasible, then
  consider other frontend stacks. Preserve the distinction between static,
  runtime, manual, and unavailable verification.

- [ ] **Improve root-cause analysis using component relationships.** Current
  clusters group related findings, mainly by check and location. Trace findings
  to shared component definitions, props, and design-system ownership so the
  product can recommend the smallest fix with the largest verified impact.

- [ ] **Add remediation ownership and delivery integrations.** Support assignee,
  due date/SLA, comments, and links to GitHub issues or selected work trackers.
  The integration must synchronize references and status history without letting
  an external ticket mark a finding verified.

- [ ] **Make prioritization configurable by business context.** The current
  scoring uses compliance/severity/confidence signals. Add project criticality,
  exposure, customer/audit commitments, occurrence trends, remediation effort,
  and transparent, organization-configurable weighting.

- [ ] **Offer auditor-ready evidence packages.** Build scoped exports for a
  framework, project, date range, and control set; include exceptions,
  verification history, provenance, and a stable manifest. Add PDF only if it
  is needed by target auditors; Markdown, HTML, and JSON already exist.

- [ ] **Add product analytics and service-health views.** Track assessment
  duration, queue latency, runtime coverage, finding age, verification lead
  time, regression rate, and CI adoption. Use this to prioritize checks and
  operational capacity without recording source code or secrets.

## Validation notes

- The repository already has GitHub Actions for linting, type checking, unit
  tests, coverage, production builds, database constraints, and Playwright e2e.
- Local lint and strict type checking passed during this review. The local test
  command could not fully run in this Codex sandbox because `npm` is unavailable
  to the package smoke test and macOS prevents Chromium from launching; the
  Linux CI workflow supplies both and should remain the release authority.

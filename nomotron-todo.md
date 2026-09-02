# ComplyLoop — Production Readiness TODO

> Generated 2026-09-02 from a full codebase audit: product spec, `docs/deploy.md`, `docs/ai/architecture.md`, Docker/compose config, CI workflows, and source verification.
> Supersedes the stale items in `todo.md` (several were already shipped — see "Verified done" at the bottom).

**Definition of done:** `npm run lint && npm run typecheck && npm run test && npm run build`

---

## P0 — Go-live blockers

- [ ] **Execute the go-live checklist from `docs/deploy.md`** — none of these are confirmed done for a real environment:
  - [ ] Provision production `DATABASE_URL` + apply `npm run db:migrate`
  - [ ] Set stable `AUTH_SECRET` + `AUTH_URL` (non-placeholder)
  - [ ] Create the production **GitHub App** (`GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY`, scopes: Contents R/W, PR R/W, Checks R/W, Metadata R) + `GITHUB_WEBHOOK_SECRET`
  - [ ] Run at least one `npm run worker` process alongside the web app (required — dev runs assessments in-process)
- [ ] **Tested backup & restore drill** — restore a `pg_dump` to staging once, run `/api/health` + sign in after restore. Scheduled daily dumps + off-host copy. (`npm run ops:backup` exists but the drill is not evidenced.)
- [ ] **Sentry alerting wired, not just DSN set** — alert on unhandled exceptions, `webhook_clone_failed`, `workspace_missing`, and `assessment_job_failed` evidence / growing job queues after deploy.
- [ ] **Load balancer / uptime probe pointed at `GET /api/health`** (returns 503 when DB is down).
- [ ] **Verify `E2E_AUTH_ENABLED` is unset on the deploy** — it skips GitHub App enforcement and clones a local fixture tree (see `.env.example` warning).

## P1 — High (correctness of the core loop in production)

- [ ] **Verify requirement status derivation edge cases** — confirm `not_applicable` / `unable_to_verify` are handled in `deriveRequirementStatus` for exceptions and human passes (grep finds no reference to these statuses in `src/core/requirement-status.ts` — confirm they're covered or fix).
- [ ] **Validate runtime-only check waterfall** — AST-only scans must yield `unable_to_verify` (never `passed`) for runtime-only, composition-sensitive, heuristic, and site-level checks per `src/analysis/check-authority.ts`. Add integration tests covering all four authority classes end-to-end.
- [ ] **Site-level runtime checks guard** — enforce ≥2 preview routes before site-level checks can produce a status (cross-route consistency: nav, help, titles).
- [ ] **Cluster remediation (one PR for many findings)** — spec §17 root-cause batching; only single-finding remediation exists today.
- [ ] **Bulk remediation parity for source findings** — bulk approve is runtime-guidance only (`canBulkApproveRemediation` in `src/core/finding-act.ts`); source findings must go patch → PR individually. Decide whether to build it or document the limitation.
- [ ] **AI graceful degradation** — verify every AI touchpoint (explanations, fix proposals, verified-fix) degrades cleanly and deterministically when `AI_GATEWAY_API_KEY` is unset; no dead UI states.
- [ ] **Complete `verified-fix.ts` → ComplyLoop re-scan workflow** — AI patches must pass the deterministic gate before "Create draft PR" (README contract).

## P2 — Medium (docs, UX, quality)

- [ ] **Remediation history view** — UI to visualize `RemediationHistoryEntry` timelines on findings.
- [ ] **Confidence indicators** — surface AI/engine confidence on finding explanations (spec §10/§12).
- [ ] **Evidence export completeness** — audit that every `EvidenceKind` variant is included in JSON/Markdown/HTML exports (`src/server/report.ts`, `src/app/evidence/`).
- [ ] **E2E coverage for webhook-driven mutations** — push/PR events → re-assess → regression → Check Run, in the Playwright harness.
- [ ] **Migration test harness** — run Drizzle migrations against a throwaway DB in CI (Dockerfile does migrate-on-start; a failure there is a cold start failure).
- [ ] **RSC / Suspense audit** — remove unnecessary client components; wrap data-fetching components in Suspense.

## P3 — Low (polish & hardening)

- [ ] **ESLint boundary rule** — enforce `src/core/` may not import from `adapters/`, `analysis/`, `server/`, `app/` (stated in architecture, not machine-enforced).
- [ ] **Trim production image** — runner stage copies full `node_modules` including devDependencies (tsx/Playwright needed at runtime, but audit for trimmable deps; consider a slim worker stage).
- [ ] **Bundle analysis in CI** — `@next/bundle-analyzer` job.
- [ ] **Perf** — memoize findings list, lazy-load remediation dialogs.

---

## Verified already done (do not re-do)

- ✅ `/api/health` route + Docker healthcheck + worker service + migrate-on-start CMD (`Dockerfile`, `docker-compose.yml`)
- ✅ Default preset management (`DefaultPresetForm` wired in Settings)
- ✅ CI workflows: `.github/workflows/ci.yml` + `complyloop-check.yml`
- ✅ Evidence append-only DB trigger + proof tests; export routes (JSON/MD/HTML)
- ✅ Postgres-backed rate limiting (`src/server/rate-limit.test.ts`)
- ✅ Sentry instrumentation (`src/instrumentation.ts`), SSRF guard on runtime URLs, encrypted GitHub tokens, idempotent webhook deliveries
- ✅ RBAC (`src/core/rbac.ts` + tests), legal pages (privacy/terms)
- ✅ Ops helpers: `npm run ops:check`, `npm run ops:backup`
- ✅ Zero TODO/FIXME markers in source

# Production Readiness TODO

> Audit date: 2026-08-07
> Scope: full repository inspection, local quality gates, production build diagnostic, and dependency audit.
> Product: ComplyLoop, a developer-first compliance engineering platform for RGAA/WCAG accessibility assessment, remediation, verification, evidence, and monitoring for React/Next.js/TypeScript repositories.

## 🔴 P0 — Must Fix Before Launch

Issues that could prevent the product from being safely or professionally sold.

- [ ] **Replace draft legal pages with counsel-reviewed commercial terms**
  - **Problem:** Terms and privacy pages explicitly say they are draft / not counsel-reviewed.
  - **Why:** A paid SaaS that processes source code, GitHub identities, repository metadata, evidence, AI prompts, and deletion/export requests needs enforceable ToS, privacy, retention, DPA/subprocessor, support, and liability language before sale.
  - **Location:** `src/app/legal/terms/page.tsx`, `src/app/legal/privacy/page.tsx`
  - **Recommendation:** Have counsel review the current product behavior and replace the draft pages with final commercial terms, privacy policy, retention policy, subprocessor list, and support/deletion process.
  - **Acceptance criteria:** Pages no longer state draft status; legal owner signs off; footer links remain visible; privacy language matches actual storage, AI, Sentry, GitHub, evidence retention, export, and deletion behavior.
  - **Estimated effort:** 🟠 Large: 1–3 days, mostly legal/product.

## 🟠 P1 — Important Before Launch

Important improvements for quality, maintainability, security, UX, or reliability.

- [ ] **Move long-running assessments and webhook work out of request-time writes**
  - **Problem:** Assessments, runtime scans, and some verification paths run inside request/webhook handlers and often inside the global write transaction. AI calls also wait inside `withWorkspaceWrite`.
  - **Why:** Slow clones, Playwright audits, AI calls, or large repos can block all writers, cause request timeouts, and create a poor experience for other tenants.
  - **Location:** `src/server/actions/assessment.ts`, `src/server/webhook.ts`, `src/server/actions/remediation-ai.ts`, `src/server/actions/remediation-verify.ts`, `src/server/db.ts`
  - **Recommendation:** Add a small durable job table/queue for assessment, runtime verification, AI generation, and webhook reassessment. Persist job state quickly, do external work outside the global write lock, then write final results in a short transaction.
  - **Acceptance criteria:** Triggering an assessment returns quickly with job status; concurrent org actions are not blocked by a running scan; job failures are visible in UI/evidence/logs; webhook jobs can retry safely.
  - **Estimated effort:** 🔴 Very large: > 3 days.

- [ ] **Replace whole-store persistence with project-scoped queries for hot paths**
  - **Problem:** The app loads all tables into an in-memory `Db`, mutates arrays, then upserts/prunes broad tables under a global advisory lock.
  - **Why:** Throughput and memory scale with total customer data, not the active project. This is a scale ceiling for multi-tenant sale.
  - **Location:** `src/server/db.ts`, `src/server/db-store/postgres-load.ts`, `src/server/db-store/postgres-persist-runtime.ts`, `src/server/db-store/postgres-persist-catalog.ts`, `src/server/db-store/schema.ts`
  - **Recommendation:** Introduce project/org-scoped repository functions for dashboard reads, evidence reads, assessment writes, finding updates, and org administration. Keep evidence append-only, but stop rewriting unrelated rows.
  - **Acceptance criteria:** Dashboard/findings/evidence routes query only visible project/org data; write paths update only affected rows; no hot path requires loading every tenant’s data.
  - **Estimated effort:** 🔴 Very large: > 3 days.

- [x] **Add real database constraints and indexes for tenant data**
  - **Done:** Migration `0005_tenant_constraints.sql` adds FKs with `ON DELETE CASCADE` on mutable tables (not evidence), status/role check constraints, unique GitHub identity indexes, and project-scoped indexes `(project_id, status)`, `(project_id, assessment_id)`, `(project_id, at)`. Org slugs were already unique (`0001`). Invalid statuses cannot be inserted; evidence rows survive project delete.
  - **Location:** `src/server/db-store/schema.ts`, `drizzle/0005_tenant_constraints.sql`

- [ ] **Make webhook delivery processing retry-safe**
  - **Problem:** The webhook route claims a delivery id before parsing and handling the payload; failures after claim return non-200/202 states but the delivery is already marked processed.
  - **Why:** A transient clone, GitHub API, DB, or JSON handling failure can permanently suppress a valid GitHub redelivery.
  - **Location:** `src/app/api/github/webhook/route.ts`, `src/server/webhook-deliveries.ts`, `src/server/webhook.ts`
  - **Recommendation:** Store delivery status (`processing`, `processed`, `failed`) with attempts and timestamps. Only mark processed after successful handling; allow safe retries for failed or stale processing records.
  - **Acceptance criteria:** Failed processing can be retried by GitHub; duplicate successful deliveries are ignored; tests cover parse failure, clone failure, success, duplicate, and stale in-progress retry.
  - **Estimated effort:** 🟡 Medium: 2–8 hours.

- [ ] **Replace in-process rate limits with durable org/user limits**
  - **Problem:** Rate limits live in a process-local `Map` and reset on restart or across instances.
  - **Why:** Paid SaaS needs reliable abuse protection, AI cost control, and fair usage across multiple instances.
  - **Location:** `src/server/rate-limit.ts`, `src/server/actions/assessment.ts`, `src/server/actions/connect.ts`, `src/server/actions/remediation-ai.ts`
  - **Recommendation:** Move rate limits to Postgres or the deployment edge and key limits by user, org, action, and possibly project. Add visible errors and operator metrics.
  - **Acceptance criteria:** Limits work across restarts and multiple app instances; AI/assessment/connect limits are configurable; tests cover limit windows and resets.
  - **Estimated effort:** 🟡 Medium: 2–8 hours.

- [ ] **Sanitize user-facing server errors**
  - **Problem:** Generic action handling returns raw `Error.message` to users, and the global error page renders `error.message`.
  - **Why:** Internal paths, provider errors, token/clone details, or infrastructure messages can leak into the UI and reduce customer trust.
  - **Location:** `src/server/action-state.ts`, `src/app/error.tsx`, server actions under `src/server/actions/`
  - **Recommendation:** Introduce typed public errors with safe messages and internal error codes. Log full details through observability, but render only product-safe copy.
  - **Acceptance criteria:** Expected validation/auth/connect errors show helpful public messages; unexpected errors show a generic message plus trace id/digest; tests cover server-action error mapping.
  - **Estimated effort:** 🟡 Medium: 2–8 hours.

- [x] **Resolve dependency audit findings**
  - **Done:** `@sentry/node` 10.70.0 pulls patched OpenTelemetry (`@opentelemetry/core` ≥ 2.8.0). `overrides` pin `esbuild` to the direct `^0.28.1` (covers drizzle-kit’s nested `@esbuild-kit` 0.18 chain) and `nanoid` to `^3.3.18`. `npm audit --audit-level=moderate` reports 0 vulnerabilities.
  - **Location:** `package.json`, `package-lock.json`

## 🟡 P2 — Post-Launch Improvements

Useful improvements that should not block the initial controlled launch.

- [ ] **Add structured FormData validation schemas**
  - **Problem:** Server actions use ad hoc `FormData` parsing while AI responses use Zod.
  - **Why:** Shared schemas would make validation, tests, and error messages more consistent.
  - **Location:** `src/server/action-state.ts`, `src/server/actions/`
  - **Recommendation:** Add small Zod schemas for connect, org, runtime, remediation, and PR actions.
  - **Acceptance criteria:** Critical actions validate all ids/enums/strings through schemas and expose safe field-level messages.

- [ ] **Add runtime-scan isolation and concurrency controls**
  - **Problem:** Runtime audits use a shared Playwright browser in-process and scan routes serially.
  - **Why:** One bad preview app can consume browser resources or delay unrelated work.
  - **Location:** `src/analysis/runtime/scan.ts`
  - **Recommendation:** Add browser lifecycle controls, per-job time budgets, route limits, and metrics for pages scanned/failures.
  - **Acceptance criteria:** Runtime audits enforce max pages, max duration, and safe browser cleanup.

- [ ] **Turn the self-check workflow into a meaningful gate or remove it**
  - **Problem:** `.github/workflows/complyloop-check.yml` intentionally runs against known-bad testdata and uses `continue-on-error: true`.
  - **Why:** Non-blocking red workflows can desensitize the team and confuse contributors.
  - **Location:** `.github/workflows/complyloop-check.yml`
  - **Recommendation:** Either make it a documented demo workflow only, or run `npm run check -- src` as a real blocking self-check.
  - **Acceptance criteria:** The workflow signal is unambiguous: either green when product code passes or clearly marked as a non-production example.

- [ ] **Add customer-facing onboarding and help states**
  - **Problem:** Empty states exist, but first-run setup still assumes the user understands GitHub App installation, runtime URL setup, evidence exports, and remediation workflow.
  - **Why:** Paying teams will include compliance, product, and engineering stakeholders with different context.
  - **Location:** `src/app/page.tsx`, `src/components/connect-project-panel.tsx`, `src/app/settings/page.tsx`, `README.md`
  - **Recommendation:** Add a concise first-run checklist and inline help for GitHub App install, first assessment, runtime audit, remediation, PR, and evidence export.
  - **Acceptance criteria:** A new admin can connect a repo and run the first assessment without reading the README.

- [ ] **Add billing, plan, and quota model when monetization is chosen**
  - **Problem:** There is no billing/subscription, seat limit, project limit, AI quota, or plan state.
  - **Why:** This is not required for a manually invoiced pilot, but it is required for self-serve SaaS revenue.
  - **Location:** Product/system-wide; no billing files currently exist.
  - **Recommendation:** Define commercial packaging first, then add billing and quotas around orgs/projects/seats/AI/runtime audits.
  - **Acceptance criteria:** Plan limits are enforced server-side and visible to owners.

## 🟢 P3 — Nice to Have

Optional improvements with relatively low business impact.

- [ ] **Track Auth.js v5 stabilization**
  - **Problem:** The app uses `next-auth` beta.
  - **Why:** Beta auth dependencies can shift APIs and behavior.
  - **Location:** `package.json`, `src/auth.ts`
  - **Recommendation:** Keep the current implementation if stable in CI, but schedule dependency review before broad launch.
  - **Acceptance criteria:** Upgrade notes reviewed; no auth regressions in e2e.

- [ ] **Add optional bundle analysis**
  - **Problem:** No bundle-size budget or analysis command is configured.
  - **Why:** The current app is mostly server-rendered, so this is not urgent, but it helps as UI grows.
  - **Location:** `package.json`, `next.config.ts`
  - **Recommendation:** Add an occasional bundle analysis workflow after build stability is fixed.
  - **Acceptance criteria:** Team can inspect large client chunks before release.

- [ ] **Polish mobile dense views**
  - **Problem:** Mobile nav exists, but finding detail, evidence tables, and org member controls should be manually checked on small screens with real data volume.
  - **Why:** Compliance tools are mostly desktop, but mobile review should not be broken.
  - **Location:** `src/app/findings/page.tsx`, `src/app/findings/[id]/page.tsx`, `src/app/evidence/page.tsx`, `src/app/org/page.tsx`
  - **Recommendation:** Add responsive QA pass and adjust dense tables/lists where needed.
  - **Acceptance criteria:** Core read-only workflows are usable at common mobile widths.

# Architecture Improvements

- **Persistence Layer**
  - **Current architecture:** Postgres is used, but the app keeps an in-memory `Db` shape and rewrites broad tables under a global lock.
  - **Problem:** Correct and simple for an MVP, but total tenant data controls read/write cost.
  - **Proposed architecture:** Project/org-scoped repository functions with row-level mutations and query-level filtering; evidence remains append-only.
  - **Migration strategy:** Add read APIs beside `loadDb`; move dashboard/findings/evidence reads first; move assessment/finding writes next; then retire broad table prune/upsert.
  - **Priority:** P1.

- **Job Execution**
  - **Current architecture:** Assessments, webhooks, runtime scans, PR creation, and AI calls run inside request-time flows.
  - **Problem:** Slow external work can block requests and global writes.
  - **Proposed architecture:** Durable jobs with `queued/running/succeeded/failed` state, retry policy, and short final write transactions.
  - **Migration strategy:** Start with assessment and webhook reassessment; then move AI/runtime verification.
  - **Priority:** P1.

- **Security Boundary For Runtime Audits**
  - **Current architecture:** Literal host/IP blocklist + DNS resolution of all addresses + Playwright route guard on every hop (including redirects). Policy in `src/analysis/runtime/url-safety.ts`.
  - **Residual:** DNS rebinding between check and connect; no network isolation or preview-domain allowlist yet.
  - **Proposed follow-up:** Route limits, isolated browser network, optional allowlisted preview domains for production tenants.
  - **Priority:** P2 residual.

- **Domain Boundaries**
  - **Current architecture:** Strong separation exists across `core`, `analysis`, `adapters`, `ai`, `server`, and `app`; AI is typed and provenance-tagged.
  - **Problem:** The largest boundary leak is persistence/job orchestration, not React component structure.
  - **Proposed architecture:** Keep current module boundaries; avoid a broad rewrite; improve only hot persistence and job boundaries.
  - **Migration strategy:** Make focused changes around repositories/jobs while preserving framework-agnostic domain types.
  - **Priority:** P1/P2.

# Technical Debt

- Whole-store load/save and global advisory lock on every write.
- JSONB payloads remain; tenant FKs, status checks, and project-scoped indexes are in `0005`.
- Request-time long-running jobs.
- In-process rate limiting.
- Server actions return raw unexpected error messages.
- Runtime audit SSRF: DNS rebinding race / network isolation still open (literal+DNS+redirect checks shipped).
- Build path relies on Turbopack and build-time Google Fonts.
- `next-auth` beta should be tracked deliberately.
- Self-check workflow is non-blocking by design and can confuse CI signal.

# Security Findings

- **Low (residual):** Runtime audit SSRF still has a DNS-rebinding window between resolve and connect; network isolation / allowlists not yet applied. Location: `src/analysis/runtime/url-safety.ts`, `src/analysis/runtime/scan.ts`.
- **Medium:** In-process rate limits reset on restart and do not work across instances. Location: `src/server/rate-limit.ts`.
- **Medium:** Unexpected server errors can be rendered to users through generic action state and the global error page. Location: `src/server/action-state.ts`, `src/app/error.tsx`.
- **Already strong:** GitHub App is required in production, OAuth tokens are stored server-side encrypted at rest, webhooks use HMAC verification, clone URLs are GitHub-only, git environment variables are scrubbed, RBAC exists for projects/orgs, evidence has append-only DB enforcement, runtime audits resolve DNS and block private/metadata redirect targets, and tests cover many authz and workflow paths.

# Performance Findings

- **High:** Whole-store reads/writes and global lock will degrade as tenants, evidence, findings, and assessments grow.
- **High:** In-process assessment/runtime scan work can block request handling and all writers.
- **Medium:** Runtime audits launch/use Playwright in the app process and scan routes serially with 30s page timeouts.
- **Medium:** Evidence and findings are paginated in UI, but underlying workspace loads still retrieve broad data.
- **Low:** Client bundle risk appears moderate because most pages are server components; defer bundle tuning until build stability and job/persistence work are done.

# Accessibility Findings

- **Medium:** The global error page places recovery controls inside a destructive `Alert`, which may create noisy screen-reader behavior for interactive recovery UI. Location: `src/app/error.tsx`.
- **Low:** Mobile dense data views need manual QA with realistic data volumes. Location: `src/app/findings/page.tsx`, `src/app/evidence/page.tsx`, `src/app/org/page.tsx`.
- **Already strong:** The app uses semantic headings/landmarks, a skip link, strict `eslint-plugin-jsx-a11y`, accessible labels in forms, permission notices, pagination labels, Playwright a11y e2e coverage, and visible empty/loading states.

# Testing Gaps

- Webhook delivery status machine so failed post-claim handling can retry (behavior covered; fix still open as P1).
- Sanitize unexpected server errors to generic public copy (current mapping covered; product-safe messages still open as P1).
- Job lifecycle tests once background assessment work exists.
- Higher-coverage action tests for connect, runtime-audit settings, AI, and PR flows.
- CI verification that `npm run build` succeeds on the intended production bundler path.

# Production Checklist

- [ ] Authentication
- [ ] Authorization
- [ ] Security
- [ ] Validation
- [ ] Error handling
- [ ] Logging
- [ ] Monitoring
- [ ] Database
- [ ] Backups
- [ ] Testing
- [ ] Accessibility
- [ ] Performance
- [ ] CI/CD
- [ ] Environment configuration
- [ ] Documentation
- [ ] UX
- [ ] Mobile
- [ ] Legal/product requirements where applicable

Notes:

- Authentication is well-designed for GitHub App production, but depends on correct `AUTH_SECRET`, `AUTH_URL`, GitHub App env, and tracking `next-auth` beta.
- Authorization has meaningful RBAC and tests; add database constraints and keep removing legacy/public fallbacks before broad multi-tenant sale.
- Logging/monitoring exist through structured logs and optional Sentry; production launch still needs real alert routing and runbooks.
- Backups are documented in `docs/deploy.md`; operators must perform a restore drill before inviting paying customers.

# Launch Recommendation

### Current readiness

❌ Not ready

The product has a strong MVP foundation: clear domain model, GitHub App support, RBAC, deterministic accessibility checks, runtime axe support with DNS/redirect SSRF checks, evidence trail, CI, e2e tests, docs, and a focused scope. It is not ready for broad commercial sale because legal is draft, the default production build is not yet deterministic, and persistence/job execution will not hold up under real multi-tenant load.

### Top 10 priorities

1. Replace draft Terms and Privacy with counsel-reviewed commercial legal.
2. Make `npm run build` pass deterministically in CI and remove build-time Google Fonts dependency.
3. Move assessments/webhooks/runtime verification to durable background jobs.
4. Replace whole-store writes with project-scoped persistence on hot paths.
5. Add database constraints and project-scoped indexes.
6. Make webhook delivery processing retry-safe.
7. Replace process-local rate limits with durable user/org limits.
8. Sanitize unexpected server errors before rendering them to users.
9. ~~Resolve or document dependency audit findings.~~ Done (`@sentry/node` 10.70.0 + esbuild/nanoid overrides).
10. Add billing/plan quotas when monetization is chosen (P2).

### Estimated effort

- **P0 legal:** 🟠 Large: 1–3 days, mostly legal/product.
- **P0 deterministic build:** 🟡 Medium: 2–8 hours.
- **P1 background jobs:** 🔴 Very large: > 3 days.
- **P1 project-scoped persistence:** 🔴 Very large: > 3 days.
- **P1 database constraints/indexes:** 🟠 Large: 1–3 days.
- **P1 webhook retry safety:** 🟡 Medium: 2–8 hours.
- **P1 durable rate limits:** 🟡 Medium: 2–8 hours.
- **P1 safe error mapping:** 🟡 Medium: 2–8 hours.
- **P1 dependency audit remediation:** 🟡 Medium: 2–8 hours.

# Verified During Audit

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm run test` passed outside sandbox: 63 passed, 1 skipped test file; 243 passed, 1 skipped tests.
- `npm run build` failed on default Turbopack path in this environment; `npx next build --webpack` passed with warnings.
- `npm audit --audit-level=moderate` passed (0 vulnerabilities) after `@sentry/node` 10.70.0 and esbuild/nanoid overrides.

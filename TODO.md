# Production Readiness TODO

> Audit date: 2026-08-07  
> Scope: full repository review (code, docs, CI, deploy, tests). **No application code was changed** for this audit.  
> Product: ComplyLoop — accessibility compliance engineering (RGAA/WCAG) for React/Next.js/TypeScript apps.

### What’s already strong (do not rewrite)

These areas are production-minded for an MVP and should be preserved:

- **Core loop is real**: connect → assess → findings → explain → remediate → verify → evidence → webhook monitoring.
- **Domain boundaries**: `src/core/` (framework-agnostic), `src/analysis/` (deterministic AST), `src/adapters/rgaa/`, `src/ai/` (never sets status), `src/server/`.
- **RBAC model**: typed roles/permissions in `src/core/rbac.ts`; most mutations use `requireOnActive` / `requireOnFindingProject`.
- **Auth hardening**: production refuses known dev `AUTH_SECRET`; requires `AUTH_URL` + GitHub App when auth is on (`src/auth-secret.ts`, `src/auth.ts`, `src/server/github-app.ts`).
- **Webhook security**: HMAC verification + delivery idempotency (`src/app/api/github/webhook/route.ts`).
- **Token at rest**: AES-256-GCM encryption (`src/server/github-tokens.ts`).
- **Evidence intent**: append-only inserts in Postgres persist path; evidence retained on disconnect.
- **CI gate**: lint + typecheck + test + build + `build:check` (`.github/workflows/ci.yml`).
- **A11y baseline**: strict `eslint-plugin-jsx-a11y`; skip link + route focus in `app-shell.tsx`.
- **Honest ops docs**: `docs/deploy.md` documents the single-instance + durable disk constraint.
- **Test depth**: ~52 colocated unit/integration tests across core, analysis, connect, webhooks, orgs, store, actions.

### Current readiness

**❌ Not ready** for commercial multi-tenant sale to paying customers.

**⚠️ Almost ready** for a carefully scoped **early-access / single-org pilot** (one long-lived instance, Postgres, GitHub App, counsel-reviewed legal, security P0s fixed).

---

## 🔴 P0 — Must Fix Before Launch

Issues that could prevent the product from being safely or professionally sold.

* [ ] **Bind GitHub App installation tokens to the authenticated user**
  * **Problem:** `connectGitHubRepoAction` accepts `installationId` from the client and calls `createInstallationAccessToken(installationId)` with the App private key — no check that the signed-in user can access that installation.
  * **Why:** Any authenticated user who learns another tenant’s installation id can mint an installation token, clone private repos, and attach them to their workspace. Cross-tenant source-code exposure.
  * **Location:** `src/server/actions/connect.ts` (≈88–108), `src/server/github-app.ts` (`createInstallationAccessToken`, `listReposViaInstallations`)
  * **Recommendation:** Before minting, verify the installation appears in `apps.listInstallationsForAuthenticatedUser` for the user’s OAuth token. Prefer resolving `installationId` server-side from the selected repo after that check; never trust client-supplied installation ids alone.
  * **Acceptance criteria:** Connecting with another user’s installation id fails with a permission error; tests cover allowed vs foreign installation ids.
  * **Effort:** 🟡 Medium

* [ ] **Enforce `project.connect` RBAC on GitHub repo connect**
  * **Problem:** Path/git connect uses `assertConnectProjectAllowed` (admin/owner). GitHub picker connect only requires a session. Disconnect correctly checks `project.connect`.
  * **Why:** A `viewer`/`member` with the shared org active can attach repos into that org, expanding tenant attack surface and compliance data.
  * **Location:** `src/server/actions/connect.ts` (`connectGitHubRepoAction`); contrast `src/server/connect-policy.ts`, `src/server/connect-github.ts` (disconnect)
  * **Recommendation:** Call the same connect authorization helper (active org + `project.connect`) inside `connectGitHubRepoAction` before cloning.
  * **Acceptance criteria:** Non-admin members cannot connect GitHub repos into an org; test asserts denial.
  * **Effort:** 🟢 Small

* [ ] **Replace draft Terms & Privacy with counsel-reviewed legal**
  * **Problem:** `/legal/terms` and `/legal/privacy` are explicitly labeled draft / counsel-needed and incomplete for commercial sale (no DPA, subprocessors incomplete, no EU rights exercise path).
  * **Why:** Selling without enforceable ToS/Privacy (and GDPR basis where applicable) is a legal and trust blocker.
  * **Location:** `src/app/legal/terms/page.tsx`, `src/app/legal/privacy/page.tsx`
  * **Recommendation:** Ship counsel-reviewed documents covering code processing, AI subprocessors, retention, deletion, liability limits, and customer responsibilities for remediations. Link from sign-in and footer.
  * **Acceptance criteria:** Pages no longer say “draft”; counsel sign-off recorded; footer links visible.
  * **Effort:** 🟠 Large (mostly legal, not engineering)

* [ ] **Lock production topology: single instance + durable disk + Postgres (or ship ephemeral workspaces)**
  * **Problem:** Clones live under `$DATA_DIR/workspaces`. Multi-replica / ephemeral serverless disks cause `workspace_missing` on webhooks and remediations. Documented in `docs/deploy.md` but easy to violate on Vercel-style deploys.
  * **Why:** First production outage for paying GitHub customers will be “webhook assessed nothing / remediations can’t find files.”
  * **Location:** `docs/deploy.md`, `src/server/webhook.ts`, `src/server/connect-shared.ts`, workspace under `$DATA_DIR`
  * **Recommendation (near-term):** Document and enforce a supported deploy shape (one Node replica, volume for `DATA_DIR`, `DATABASE_URL`). Add a health/ready check that fails if `DATA_DIR` is not writable. **(Follow-up architecture):** ephemeral clone-per-job so horizontal scale is possible (see Architecture Improvements).
  * **Acceptance criteria:** Deploy runbook matches one supported shape; health endpoint verifies writable workspaces; webhook failure mode remains clear when volume is missing.
  * **Effort:** 🟡 Medium (ops) / 🔴 Very large (ephemeral workspaces)

* [ ] **Disable or isolate the shared writable sample project on hosted multi-tenant**
  * **Problem:** Seeded sample has no `orgId`/`ownerUserId`; RBAC grants view/assess/remediate to everyone including anonymous. Remediations mutate the shared workspace under `$DATA_DIR`.
  * **Why:** On a shared deployment, any visitor can vandalize demo findings/files and interfere with other users’ first impression.
  * **Location:** `src/server/seed.ts`, `src/core/rbac.ts` (`canOnProject` for unscoped projects)
  * **Recommendation:** Hosted mode: per-user sample copies, or read-only sample with remediations disabled unless signed in to a personal copy. Keep current behavior for laptop `NODE_ENV=development` only.
  * **Acceptance criteria:** Unsigned users on production cannot mutate sample workspace; signed-in users get an isolated copy or read-only demo.
  * **Effort:** 🟡 Medium

* [ ] **Add operator backups + health check before inviting paying orgs**
  * **Problem:** `docs/deploy.md` checklist mentions backups; there is no health/ready endpoint, no Dockerfile for the app, and no backup script/runbook automation. Compose only runs Postgres.
  * **Why:** Without health checks and restore-tested backups, a disk/Postgres failure is an unrecoverable customer incident.
  * **Location:** `docs/deploy.md`, `docker-compose.yml` (Postgres only); no `Dockerfile`, no `/api/health`
  * **Recommendation:** Add `GET /api/health` (process up + optional DB ping + `DATA_DIR` writable). Document Postgres + volume backup/restore steps; practice restore once. Optionally add an app Dockerfile for the supported single-instance shape.
  * **Acceptance criteria:** Health returns non-200 when DB or workspaces are unavailable; backup/restore documented and tested once.
  * **Effort:** 🟡 Medium

---

## 🟠 P1 — Important Before Launch

Important improvements for quality, maintainability, security, UX, or reliability.

* [ ] **DNS-aware / allowlisted git remote URLs (SSRF hardening)**
  * **Problem:** `assertSafeGitRemoteUrl` blocks literal private IPs and some hostnames but does not resolve DNS or follow redirects. A public hostname can resolve to metadata/RFC1918.
  * **Why:** Hosted connect via git URL can SSRF internal services from the app host during `git clone`.
  * **Location:** `src/server/connect-policy.ts`, `src/server/connect-url.ts`, `src/server/connect-shared.ts`
  * **Recommendation:** Resolve A/AAAA after parse and re-check IPs; in hosted mode allowlist `github.com` / known hosts only (GitHub picker already preferred).
  * **Acceptance criteria:** Hostnames resolving to private/link-local IPs are rejected; tests cover DNS-mocked cases or allowlist-only mode.
  * **Effort:** 🟡 Medium

* [ ] **Stop embedding GitHub OAuth access tokens in the JWT session cookie**
  * **Problem:** On sign-in, `token.accessToken = account.access_token` is stored in the Auth.js JWT in addition to encrypted server-side storage.
  * **Why:** Cookie blast radius includes live GitHub tokens if `AUTH_SECRET` leaks; server store already exists.
  * **Location:** `src/auth.ts` (jwt callback ≈72–78; `getGitHubAccessToken` ≈102–120), `src/types/next-auth.d.ts`
  * **Recommendation:** Persist only via `storeUserGitHubToken`; load via `getStoredGitHubToken(sub)`. Prefer installation tokens when App is configured.
  * **Acceptance criteria:** JWT payload no longer contains `accessToken`; GitHub connect/PR/Checks still work.
  * **Effort:** 🟢 Small

* [ ] **Rate-limit expensive operations**
  * **Problem:** No application-level rate limits on connect/clone, assessment, AI explain/remediate, webhook, or auth.
  * **Why:** Authenticated users (or stolen webhook secret) can burn CPU, disk, GitHub API quota, and AI cost.
  * **Location:** `src/server/actions/connect.ts`, `assessment.ts`, `remediation-ai.ts`, `src/app/api/github/webhook/route.ts`; no `middleware.ts`
  * **Recommendation:** Per-user/IP limits (WAF or in-app) on connect, assess, AI; reject webhooks missing `x-github-delivery` after signature verify (`src/server/webhook-deliveries.ts` currently treats empty id as always-new).
  * **Acceptance criteria:** Burst connect/assess returns 429 / form error; webhook without delivery id returns 400.
  * **Effort:** 🟡 Medium

* [ ] **Restrict admin privilege over other admins**
  * **Problem:** `canManageOrgMembers` treats `admin` and `owner` equally — admins can invite/promote/remove peer admins.
  * **Why:** Lateral privilege expansion after over-invite or single admin compromise.
  * **Location:** `src/server/orgs.ts`, `src/server/actions/org.ts`, `src/core/rbac.ts`
  * **Recommendation:** Only `owner` may invite/change/remove `admin`; admins manage `member`/`viewer` only.
  * **Acceptance criteria:** Tests deny admin→admin role changes; owners retain full control.
  * **Effort:** 🟢 Small

* [ ] **Account / data lifecycle for paying customers (GDPR-ready minimum)**
  * **Problem:** Sign-in/out only. No account deletion, no customer-initiated data export of all personal/project data, no clear operator deletion path for clones + tokens + evidence.
  * **Why:** EU/enterprise buyers expect deletion and export; privacy page already describes retention without a product path.
  * **Location:** `src/components/auth-controls.tsx`, `src/app/legal/privacy/page.tsx`, org/project disconnect paths
  * **Recommendation:** Org owner “delete org / export data” flows; user sign-out already clears tokens — extend with delete-account that removes memberships, owned projects, clones, and stored tokens. Document evidence retention exceptions.
  * **Acceptance criteria:** Documented self-serve or support-assisted deletion within a stated SLA; export produces machine-readable archive of user-visible data.
  * **Effort:** 🟠 Large

* [ ] **Brand-critical accessibility polish on feedback surfaces**
  * **Problem:** Product sells accessibility compliance. Success on PR create uses default `Alert` → `role="alert"` (should be polite `status`). `CopyButton` has no live region. Remediation lifecycle step is visual-only.
  * **Why:** Screen-reader users get incorrect urgency or miss confirmation — brand trust failure.
  * **Location:** `src/components/create-pr-form.tsx`, `src/components/ui/alert.tsx`, `src/components/copy-button.tsx`, `src/components/findings/finding-remediation-card.tsx`, `src/components/stateful-action-form.tsx` (good pattern to mirror)
  * **Recommendation:** Match `StatefulActionForm` (`role="status"` for success). Add `aria-live="polite"` for copy. Mark current remediation stage with `aria-current`.
  * **Acceptance criteria:** RTL tests assert status vs alert roles; copy announces “Copied”.
  * **Effort:** 🟢 Small

* [ ] **Pending/error UX for AI explanation & remediation forms**
  * **Problem:** AI forms are plain `<form action>` without pending labels or inline errors (unlike `StatefulActionForm`). No route-level `loading.tsx` anywhere.
  * **Why:** Users get stuck wondering if Generate did anything; slow AI looks like a hang.
  * **Location:** `src/components/findings/finding-explanations-card.tsx`, `finding-remediation-card.tsx`; `src/app/**` (0 `loading.tsx`)
  * **Recommendation:** Use `useActionState` / `StatefulActionForm` pattern; add `loading.tsx` for findings and dashboard at minimum.
  * **Acceptance criteria:** AI buttons show pending; failures surface as `role="alert"`.
  * **Effort:** 🟡 Medium

* [ ] **Move `shadcn` CLI out of runtime dependencies**
  * **Problem:** `shadcn@4.16.2` is in `dependencies` but not imported by app code (~scaffold CLI only).
  * **Why:** Inflates production install size and attack surface for no runtime benefit.
  * **Location:** `package.json`
  * **Recommendation:** Move to `devDependencies` or remove after components are generated; keep `radix-ui` / CVA as needed by `src/components/ui/*`.
  * **Acceptance criteria:** Production `npm ci --omit=dev` no longer installs `shadcn` CLI; UI still builds.
  * **Effort:** 🟢 Small

* [ ] **Playwright smoke of the core loop in CI**
  * **Problem:** ~52 unit tests; no browser e2e for connect → assess → remediate → verify → evidence.
  * **Why:** Regressions in the sold loop will ship undetected by unit mocks.
  * **Location:** No Playwright/Cypress; CI is unit-only (`.github/workflows/ci.yml`)
  * **Recommendation:** One happy-path e2e against sample project (unsigned laptop mode) plus one authz denial case. Run in CI on PRs.
  * **Acceptance criteria:** CI fails if assessment → verify → evidence export breaks on sample.
  * **Effort:** 🟠 Large

* [ ] **Production monitoring baseline**
  * **Problem:** Structured logs + optional Sentry (`src/server/observability.ts`); `tracesSampleRate: 0`; no latency/error SLOs, no alerting runbook.
  * **Why:** Paying customers need someone to notice webhook storms and assessment failures.
  * **Location:** `src/server/observability.ts`, `.env.example` (`SENTRY_DSN`)
  * **Recommendation:** Require `SENTRY_DSN` in production checklist; alert on webhook `workspace_missing`, assessment failures, auth misconfig. Keep logs JSON for aggregation.
  * **Acceptance criteria:** Staging/prod has Sentry (or equivalent) with at least error alerts to an on-call channel.
  * **Effort:** 🟡 Medium

* [ ] **Evidence append-only enforced beyond app convention**
  * **Problem:** Postgres persist path inserts missing evidence ids only; no DB trigger/privilege denying UPDATE/DELETE. JSON store can rewrite the whole array.
  * **Why:** Accidental code or DBA ops can destroy audit trail — the product’s core promise.
  * **Location:** `src/server/db-store/postgres-persist-runtime.ts`, `drizzle/0000_init.sql`
  * **Recommendation:** DB role without UPDATE/DELETE on `evidence`, or trigger raising exception; document operator policy.
  * **Acceptance criteria:** Migration + test/manual proof that UPDATE/DELETE on evidence fails under app role.
  * **Effort:** 🟡 Medium

---

## 🟡 P2 — Post-Launch Improvements

Useful improvements that should not block a carefully scoped initial pilot launch.

* [ ] **Replace whole-Db load/save with query-scoped persistence** (see Architecture Improvements) — required before ~1k tenants. **Effort:** 🔴 Very large
* [ ] **Foreign keys, unique constraints, and indexes for hot paths** — e.g. membership `(org_id, user_id)` unique; indexes on `findings.status`, `remediations.finding_id`, `alerts.project_id`. **Location:** `drizzle/`, `src/server/db-store/schema.ts`. **Effort:** 🟡 Medium
* [ ] **Clear orphan alerts on project disconnect** — findings pruned; alerts for `projectId` not cleared in `connect-github.ts`. **Effort:** 🟢 Small
* [ ] **Assessment/evidence retention policy** — unbounded assessment payloads (`fileHashes`) and evidence growth. **Effort:** 🟠 Large
* [ ] **Tighten local-path connect if ever enabled** — require auth, force owner, allowlist roots under `$HOME`/`$DATA_DIR`. **Location:** `src/server/connect-local.ts`, `connect-policy.ts`. **Effort:** 🟡 Medium
* [ ] **Zod (or shared schemas) at server-action boundaries** — today mostly `FormData` + typeof; zod used mainly for AI. **Effort:** 🟠 Large
* [ ] **Findings URL state** — tab + pagination for open findings only; resolved/dismissed capped without pagination (`src/app/findings/page.tsx`). **Effort:** 🟡 Medium
* [ ] **Sanitize report download filename** — `Content-Disposition` uses unsanitized `project.name` (`src/app/evidence/report/route.ts`). **Effort:** 🟢 Small
* [ ] **Coverage gate on core + actions** — `test:coverage` exists but CI has no threshold. **Effort:** 🟢 Small
* [ ] **Stabilize Auth.js** — `next-auth@5.0.0-beta.32`; track stable release / security advisories. **Effort:** 🟡 Medium (wait + upgrade)
* [ ] **Guided first-run onboarding** — sample → connect GitHub App → first assessment checklist (beyond README). **Effort:** 🟠 Large
* [ ] **Remove legacy `app_meta.activeProjectId` stomps** — UI uses cookies; global field still written on connect/seed. **Effort:** 🟢 Small
* [ ] **Decouple `src/ai/` from `src/server/observability`** — inject logger at boundary. **Effort:** 🟢 Small

---

## 🟢 P3 — Nice to Have

Optional improvements with relatively low near-term business impact.

* [ ] **Billing / plans / quotas** — none today; add when monetizing beyond manual invoicing. Spec MVP does not require it.
* [ ] **Runtime axe in CI** on product UI (lint ≠ runtime).
* [ ] **Static legal pages** — drop unnecessary `force-dynamic` on `/legal/*`.
* [ ] **Reduce `"use client"` on static UI** (e.g. `table.tsx` wrapping SSR evidence).
* [ ] **App container image** + compose profile for full stack demo.
* [ ] **Transactional email** (org invites currently assume user id/login knowledge — no invite email flow).
* [ ] **Multi-framework adapters** (SOC 2, ISO) — explicitly post-MVP per product spec.
* [ ] **Human-readable severity beyond color+text** already OK; optional icon+text patterns.

---

# Architecture Improvements

### 1. Persistence: document store → query engine

| | |
|--|--|
| **Current architecture** | Dual store (JSON or Postgres) still models the world as one in-memory `Db`. Every request can `loadDb()` all tables; every write re-syncs mutable tables under a **global** process mutex + `pg_advisory_xact_lock` (`src/server/db.ts`, `postgres-load.ts`, `write-lock.ts`). Postgres stores JSONB payloads + a few indexed columns. |
| **Problem** | Throughput and memory scale with **total** tenant data, not the active project. One writer for all orgs. Pool max 3 (`client.ts`) reinforces serialization. Fine for demos; unsafe past small pilots. |
| **Proposed architecture** | Project-scoped repositories: load/mutate only the active org/project. Real columns for query filters; transactions per project write. Keep evidence insert-only. Retire whole-Db sync. |
| **Migration strategy** | 1) Add project-scoped read APIs beside `loadDb`. 2) Move hot paths (workspace, assessment persist) off full reload. 3) Stop pruning-via-full-upsert. 4) Drop in-memory `Db` as the write API. |
| **Priority** | P2 for pilot; **P0 for scale** beyond ~tens of orgs / concurrent assessments. |

### 2. Workspaces: durable local clones → ephemeral job workspaces

| | |
|--|--|
| **Current architecture** | `git clone` into `$DATA_DIR/workspaces/{projectId}`; remediations and webhooks assume the tree stays on that instance. |
| **Problem** | Blocks horizontal scale and serverless; volume loss = broken monitoring. |
| **Proposed architecture** | Clone (or sparse checkout) per assessment/remediation job into ephemeral storage; cache by commit SHA; optional remote-only patch apply via GitHub API for remediations. |
| **Migration strategy** | Keep current path for single-instance; add job runner behind a feature flag; move webhook assess onto jobs first. |
| **Priority** | P0 constraint documented now; implementation P2 unless multi-instance is required at launch. |

### 3. Tenant isolation: app RBAC → DB constraints (+ optional RLS)

| | |
|--|--|
| **Current architecture** | Isolation is TypeScript filters (`project-visibility`, `rbac`). No FKs, no RLS. |
| **Problem** | Any missed filter is a cross-tenant leak; compromised process sees all rows. |
| **Proposed architecture** | FKs + unique membership; eventually Postgres RLS by `org_id` for defense in depth. |
| **Migration strategy** | Add constraints first (safe, high value); RLS after query-scoped persistence (RLS fights whole-table loads). |
| **Priority** | P1 constraints; P2 RLS. |

### 4. Keep module boundaries; fix small leaks only

| | |
|--|--|
| **Current architecture** | Clear layers (core / analysis / adapters / ai / server / app). Domain-split server actions (no barrels). |
| **Problem** | Minor: AI → server observability; assessment orchestration couples adapters + AI (acceptable for MVP). |
| **Proposed architecture** | Inject observability ports into AI; keep RGAA behind adapter. **Do not** introduce enterprise packaging for its own sake. |
| **Priority** | P2/P3. |

---

# Technical Debt

| Item | Notes |
|------|--------|
| Whole-Db sync abstraction | Largest structural debt — see Architecture #1 |
| Dual active project (cookie vs `app_meta`) | Confusing for new contributors |
| Ad-hoc FormData validation | Inconsistent vs zod on AI paths |
| Disconnect leaves alerts | Orphan rows |
| Shared unscoped projects ACL | Intentional for demo; dangerous if left on in prod |
| `shadcn` as runtime dependency | Packaging hygiene |
| Auth.js beta | Track upgrades |
| No e2e | Unit-heavy, browser-light |
| Assessment snapshot bloat | `fileHashes` in JSONB payloads |
| Global write lock + pool size 3 | Correct for free-tier demo; wrong for multi-tenant SaaS |
| Client-visible raw `Error.message` | `action-state.ts` may leak internal paths |

---

# Security Findings

| Severity | Finding | Location |
|----------|---------|----------|
| **Critical** | GitHub App installation token minting not bound to caller | `src/server/actions/connect.ts`, `src/server/github-app.ts` |
| **High** | GitHub connect skips `project.connect` RBAC | `connectGitHubRepoAction` |
| **High** | Local path connect = arbitrary FS read/write when enabled; unsigned allowed when flag on | `connect-local.ts`, `connect-policy.ts` |
| **High** | Shared sample project world-writable by design | `seed.ts`, `rbac.ts` |
| **Medium** | Git URL SSRF: host blocklist without DNS resolution | `connect-policy.ts` |
| **Medium** | OAuth access token in JWT cookie | `auth.ts` |
| **Medium** | No rate limiting on connect/assess/AI/webhook | actions + webhook route |
| **Medium** | Admins can manage other admins | `orgs.ts` |
| **Low** | Webhook replay if `x-github-delivery` missing | `webhook-deliveries.ts` |
| **Low** | Unsanitized `Content-Disposition` filename | `evidence/report/route.ts` |
| **Low** | `trustHost: true` — mitigate with always-set `AUTH_URL` in deployed envs | `auth.ts` |

**Already solid:** production secret hard-fail; GitHub App required in prod; webhook HMAC; token encryption at rest; path traversal guard on remediations (`workspace-path.ts`); finding/project IDOR checks on most mutations; httpOnly/sameSite cookies for active org/project; SSRF hostname blocklist (literal); git env scrubbing.

---

# Performance Findings

| Finding | Impact | When it matters |
|---------|--------|-----------------|
| Full multi-table `loadDb` per request | Latency + memory grow with all tenants | > tens of projects / large evidence |
| Global advisory lock on every write | Serializes all tenant writes | Concurrent assessments/webhooks |
| Assessment stores full `fileHashes` snapshots | DB/JSONB growth | Frequent re-assess |
| GitHub repo list during server render of connect panel | Slow first paint when signed in | Large installation repos |
| Pool max 3 + global lock | Queueing before CPU saturates | Multi-user hosted |
| All pages `force-dynamic` | No CDN caching (acceptable for app shell) | Legal pages unnecessarily dynamic |
| No route `loading.tsx` | Perceived hang on slow assessments/AI | UX, not throughput |

Do **not** chase micro-optimizations until persistence is project-scoped.

---

# Accessibility Findings

| Severity | Finding | Location |
|----------|---------|----------|
| **High** | Success feedback uses `role="alert"` via default `Alert` | `create-pr-form.tsx`, `ui/alert.tsx` |
| **High** | Copy confirmation not announced | `copy-button.tsx` |
| **Medium** | Remediation lifecycle stage not exposed to AT | `finding-remediation-card.tsx` |
| **Medium** | Error page nests interactive recovery inside `role="alert"` | `error.tsx` |
| **Gap** | No runtime axe/Playwright a11y CI (lint-only) | `.github/workflows/ci.yml` |

**Already solid:** strict jsx-a11y; skip link; focus to `h1` on nav; labeled forms with `aria-invalid`/`aria-describedby`; `AlertDialog` instead of `window.confirm`; pagination labels; verify-feedback tests for alert/status roles.

---

# Testing Gaps

Prioritize business-critical and high-risk areas (not line coverage vanity):

1. **Security:** foreign GitHub `installationId` minting; GitHub connect without `project.connect`; org role escalation admin→admin.
2. **E2E smoke:** sample assess → remediate → verify → evidence export (Playwright).
3. **Webhook:** missing delivery id; `workspace_missing` path; signature failure.
4. **Authz regressions:** already partly covered in `actions.remediation.test.ts` — keep expanding for connect/org.
5. **SSRF/DNS policy** once implemented.
6. **Page-level** dashboard/requirements/evidence smoke (optional after e2e).

CI today: lint, typecheck, unit test, build — good foundation, not sufficient alone for launch confidence.

---

# Production Checklist

* [ ] Authentication — GitHub App + `AUTH_URL` + strong `AUTH_SECRET` in prod
* [ ] Authorization — fix GitHub connect RBAC + installation binding; sample isolation
* [ ] Security — rate limits; JWT token removal; DNS/allowlist git URLs; local connect off
* [ ] Validation — action-boundary schemas for connect/org ids at minimum
* [ ] Error handling — user-safe messages; keep Sentry for internals
* [ ] Logging — structured JSON on (already present)
* [ ] Monitoring — Sentry (or equiv) + alerts for webhook/assessment failures
* [ ] Database — `DATABASE_URL` + migrations; evidence insert-only enforced at DB
* [ ] Backups — Postgres + `DATA_DIR` restore tested
* [ ] Testing — unit CI green + core-loop e2e
* [ ] Accessibility — P1 feedback/copy/lifecycle fixes; lint remains strict
* [ ] Performance — single-instance OK for pilot; plan project-scoped DB before scale
* [ ] CI/CD — existing quality gate; add e2e job
* [ ] Environment configuration — `.env.example` / `docs/deploy.md` followed exactly
* [ ] Documentation — runbook for supported deploy shape; customer-facing help later
* [ ] UX — AI pending states; loading UI; empty states already decent
* [ ] Mobile — Sheet nav present; re-check findings/detail on small screens
* [ ] Legal/product — counsel-reviewed Terms/Privacy; account deletion/export path
* [ ] Health checks — `/api/health` (or equivalent)
* [ ] Billing — optional until monetization model chosen

---

# Launch Recommendation

### Current readiness

**❌ Not ready** for general commercial multi-tenant sale.

**⚠️ Almost ready** for a **paid early-access pilot** with constraints:

- One org / few seats, single long-lived Node instance, durable disk, Postgres
- GitHub App only (no local-path connect)
- Security P0s fixed (installation binding + connect RBAC + sample isolation)
- Counsel-reviewed legal + backups + health + Sentry

### Top 10 priorities (by business / risk impact)

1. **Bind GitHub App installation tokens to the caller** (Critical security)
2. **Enforce `project.connect` on GitHub connect** (High security)
3. **Counsel-reviewed Terms & Privacy** (legal/trust)
4. **Isolate or lock down shared sample on hosted** (integrity/trust)
5. **Commit to supported deploy topology + health + backups** (ops survival)
6. **Remove OAuth token from JWT; rate-limit connect/assess/AI** (security/cost)
7. **DNS/allowlist hardening for git URLs** (SSRF)
8. **Brand a11y polish** (success roles, copy live region, lifecycle)
9. **Account/data deletion + export minimum** (enterprise/GDPR readiness)
10. **Playwright core-loop smoke in CI** (ship confidence)

### Estimated effort (P0 / P1)

| Item | Effort |
|------|--------|
| Bind installation tokens to user | 🟡 Medium |
| Enforce GitHub connect RBAC | 🟢 Small |
| Counsel-reviewed legal | 🟠 Large (legal) |
| Deploy topology + health + backups | 🟡 Medium |
| Sample project isolation | 🟡 Medium |
| Git URL SSRF hardening | 🟡 Medium |
| Drop access token from JWT | 🟢 Small |
| Rate limiting + webhook delivery id required | 🟡 Medium |
| Admin cannot manage admins | 🟢 Small |
| Account deletion / export | 🟠 Large |
| A11y feedback polish | 🟢 Small |
| AI form pending/errors + loading UI | 🟡 Medium |
| Move `shadcn` to devDependencies | 🟢 Small |
| Playwright smoke e2e | 🟠 Large |
| Production monitoring baseline | 🟡 Medium |
| Evidence DB append-only enforcement | 🟡 Medium |

**Rough total to early-access pilot (engineering only, excl. legal calendar):** ~2–4 engineer-weeks if focused.  
**Rough total to scalable multi-tenant SaaS (incl. persistence + ephemeral workspaces):** additional multi-week / multi-sprint program — do not pretend the current store is that product.

---

*This file is the master implementation roadmap from the 2026-08-07 production readiness audit. Prefer closing P0s before net-new features that do not advance the sold compliance loop.*

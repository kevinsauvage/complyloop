# Production Readiness TODO

Master implementation roadmap to take ComplyLoop from a strong single-tenant MVP to a
commercial, multi-tenant SaaS. Scope reviewed: `src/app`, `src/components`, `src/server`,
`src/core`, `src/analysis`, `src/adapters`, `src/ai`, `packages/check`, docs, CI, deps.

Effort legend: 🟢 Small (<2h) · 🟡 Medium (2–8h) · 🟠 Large (1–3d) · 🔴 Very large (>3d)

> Context that shapes every priority below: the product is architected as a **single
> shared JSON/JSONB "whole-Db" document** loaded and rewritten on every request, with a
> **global `activeProjectId`** and several **unscoped read paths**. Mutations are RBAC-guarded,
> but reads and one connect action are not. That combination is the core blocker for selling
> to more than one customer.

## 🟡 P2 — Post-Launch Improvements

- [ ] **Escape the whole-Db read-modify-write model** 🔴
  - **Problem:** Every request hydrates all tenants' data; every write rewrites all mutable tables; one global advisory lock serializes all tenants' writes; the JSONB "payload" model requires a ~450-line hand-written upsert/delete.
  - **Why:** Hard scaling ceiling and high maintenance risk; a missed table in the persist code corrupts state.
  - **Location:** `src/server/db.ts:29-65`; `src/server/db-store/postgres.ts:60-454`; `src/server/db-store/write-lock.ts:8-35`.
  - **Recommendation:** Migrate to real relational tables with per-project/tenant queries, append evidence directly, and replace the global lock with row/tenant-scoped transactions. (See Architecture.)
  - **Acceptance criteria:** Reads/writes are scoped to a tenant and don't load unrelated data; no single global write lock.

- [ ] **Foreign keys + referential integrity in Postgres** 🟡
  - **Problem:** No FKs/cascades; integrity depends on "rewrite from memory". Alerts aren't removed on disconnect; evidence is retained (correct) but unbounded.
  - **Location:** `src/server/db-store/schema.ts`; disconnect in `src/server/connect.ts:365-398`.
  - **Recommendation:** Add FKs + unique constraints (`requirements (project_id, control_id)`), and clean up orphaned alerts on disconnect.
  - **Acceptance criteria:** DB rejects orphaned rows; disconnect leaves no dangling alerts.

- [ ] **Transactional migration runner** 🟢
  - **Problem:** Applying SQL and recording it in `_complyloop_migrations` aren't in one transaction; a crash between them leaves inconsistent bookkeeping.
  - **Location:** `scripts/db-migrate.ts:42-55`.
  - **Recommendation:** Wrap each migration's apply + record in a single transaction.
  - **Acceptance criteria:** A mid-migration crash leaves the migration either fully applied+recorded or not at all.

- [ ] **Rate limiting on webhook + auth + connect endpoints** 🟡
  - **Problem:** No rate limiting anywhere; webhook and connect trigger clones/assessments (expensive).
  - **Location:** `src/app/api/github/webhook/route.ts`; connect actions.
  - **Recommendation:** Add per-IP/per-token rate limits on the webhook and connect/assess paths.
  - **Acceptance criteria:** Abusive request volume is throttled with 429s.

- [ ] **Shorten lock hold times (no network under the write lock)** 🟡
  - **Problem:** AI generation and the webhook Check Run HTTP call happen while holding the store write lock, blocking all other writers.
  - **Location:** `src/server/actions.ts:558-619`; `src/server/webhook.ts:177-226`.
  - **Recommendation:** Do network I/O outside the lock; take the lock only to persist results.
  - **Acceptance criteria:** No outbound HTTP occurs while the write lock is held.

- [ ] **Toast/flash feedback after redirects** 🟢
  - **Problem:** No cross-navigation success feedback after actions that revalidate/redirect.
  - **Recommendation:** Add a lightweight flash mechanism (searchParams or cookie) surfaced as a toast.
  - **Acceptance criteria:** Post-action success is visible after navigation.

- [ ] **Onboarding flow for signed-in tenants** 🟡
  - **Problem:** Onboarding is demo-first (sample project + always-on connect panel); no guided connect → scope → assess → first finding for a real tenant.
  - **Location:** `src/app/page.tsx:143-156`; `src/app/org/page.tsx:40-48`.
  - **Recommendation:** Add a first-run checklist for signed-in users with no real project yet.
  - **Acceptance criteria:** A new tenant is guided to their first assessment.

---

## 🟢 P3 — Nice to Have

- [ ] **Findings search / filter (severity, control, file)** 🟡 — only status sections today (`src/app/findings/page.tsx`).
- [ ] **Move `activeProjectId` magic + `dataDir()` duplication into shared helpers** 🟢 — duplicated in `json.ts`, `github-tokens.ts`, `webhook-deliveries.ts`.
- [ ] **`CheckId` boundary leak** 🟢 — `src/adapters/rgaa/guidance.ts:1` imports `CheckId` from `@/analysis`; move the id type to core.
- [ ] **Broaden check coverage** 🟡 — `button-name`/`input-label` only match native tags, not `role="button"` / `select` / `textarea`; `iframe`/`aria-hidden` with dynamic expressions.
- [ ] **Git hooks (pre-commit lint/typecheck)** 🟢 — no husky/lint-staged; gate is CI + manual only.
- [ ] **Stricter tsconfig flags** 🟢 — add `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- [ ] **Import-boundary lint (core ↔ adapters/analysis)** 🟢 — enforce dependency direction with a rule.
- [ ] **EmptyState/brand headings** 🟢 — `EmptyState` title is a `<p>`; brand mark is a non-link `<p>` (`src/app/layout.tsx:32-36`; `src/components/ui.tsx:56-61`).

---

# Architecture Improvements

### 1. Tenant-scoped persistence (replace whole-Db RMW)

- **Current architecture:** One logical document (JSON file or a set of JSONB `payload` tables) is loaded in full on every request and rewritten in full on every mutation, serialized by a single global advisory lock. `activeProjectId` is a single global value.
- **Problem:** No query-level tenant isolation; unbounded memory growth (evidence); global lock serializes all tenants; ~450 lines of hand-written persist logic that can silently drop a table.
- **Proposed architecture:** Normalized relational schema with foreign keys; queries scoped by `orgId`/`projectId`; evidence appended (and paginated) directly; per-tenant/row transactions instead of one global lock; per-user active-project in session.
- **Migration strategy:** Keep the `Db`-shaped facade for the domain/assessment code initially; behind it, replace whole-store load/save with scoped repository functions table by table (start with evidence + findings reads, then writes). Dual-run against the JSON store in tests during the transition.
- **Priority:** P2 (the read-isolation _symptoms_ are fixed as P0 patches first; this is the durable fix).

### 2. GitHub App instead of broad OAuth `repo` scope

- **Current:** OAuth with `repo` scope; user token stored (encrypted) and reused for clone/pull/PR/Check Runs.
- **Problem:** Excessive standing permissions across all of a user's repos; enterprise procurement blocker.
- **Proposed:** GitHub App with per-repo installation and least-privilege permissions; installation tokens minted on demand.
- **Migration strategy:** Add App auth alongside OAuth; migrate connect/webhook/PR to installation tokens; deprecate the broad scope.
- **Priority:** P1 for launch credibility, P2 for full migration.

### 3. Durable/ephemeral clone strategy

- **Current:** Persistent clones on local disk; single-instance assumption.
- **Problem:** Blocks horizontal scaling and serverless; webhook fails when disk is cold.
- **Proposed:** Clone-per-job into ephemeral storage (or sparse fetch of changed files) so no long-lived shared disk is required.
- **Migration strategy:** Introduce a workspace provider interface; keep the disk provider for local, add an ephemeral provider for hosted.
- **Priority:** P0 constraint (document single-instance) now; P2 for the real fix.

---

# Technical Debt

- `actions.ts` at 1088 lines mixes many domains; high review risk for permission bugs.
- JSONB document store requires ~450 lines of manual upsert/delete (`postgres.ts`) — brittle, easy to miss a table.
- Duplicated helpers: `dataDir()` (3 modules), `hasAriaName` (3 checks), near-twin GitHub/git clone paths.
- `saveDb` remains a public unlocked API — easy to misuse outside the write lock.
- `next-auth` pinned to `^5.0.0-beta.32` (beta) — breaking-change exposure; plan to pin exactly and track upstream to GA.
- Requirement statuses have no explicit transition graph in core (derived ad hoc in assessment/actions).
- Migration runner is a custom ordered-SQL applier (fine for now, not journaled like Drizzle Kit).

---

# Security Findings

**Critical**

- Cross-tenant read leak: findings detail, evidence page, JSON export, MD/HTML reports (P0).
- Unauthenticated `connectProjectAction` → arbitrary local path connect + server-side clone (P0).
- Path traversal on remediation apply / PR write (P0).

**High**

- Dev-secret fallback for `AUTH_SECRET` can reach production (`src/auth.ts:49`).
- Global `activeProjectId` cross-user contamination.
- Webhook idempotency TOCTOU (duplicate processing).
- Over-broad `repo` OAuth scope.

**Medium**

- `sslmode=require` → `rejectUnauthorized: false` (DB MITM).
- Silent token/store decrypt/parse failures look like "logged out" and hide tampering.
- Local-path connector exposes host filesystem if enabled in a shared deployment.
- No rate limiting on webhook/connect/auth.

**Low**

- Empty catches around non-fatal git/PR cleanup reduce diagnosability.
- No structured logging/APM to detect abuse.

_(No SQL injection found — Drizzle parameterizes; no `dangerouslySetInnerHTML`; git env is sanitized in `src/server/git.ts`; webhook HMAC verification and AES-256-GCM token encryption are correctly implemented.)_

---

# Performance Findings

- Full-store hydrate on every page/request; no query-level scoping (`getWorkspace`/`loadDb`).
- No pagination on findings, evidence, requirements, remediation history.
- Duplicate `getWorkspace()` + `auth()` per request (no `React.cache`).
- O(controls × findings) loops in requirements/assessment; O(n²) cluster resolution in findings list.
- Every page `force-dynamic`; no static/ISR/caching for read-mostly views.
- Evidence append-only and never pruned → grows unbounded and is loaded in full each time.

---

# Accessibility Findings

**High**

- `text-zinc-400` body/meta text fails WCAG AA contrast (multiple pages).
- Form errors not programmatically associated (`aria-invalid`/`aria-describedby`) — ironic vs the product's own check.
- No skip link; sidebar-first tab order.
- Async outcomes (failed verify, "Copied") not announced via live regions.

**Medium**

- `EmptyState` title and brand mark are `<p>`, weakening the heading outline.
- Remediation lifecycle inactive steps rely on low-contrast `text-zinc-400`.
- No focus management after navigation/actions.
- `aria-hidden={false}` false positive in the engine (also a correctness bug).

**Done well:** `lang="en"`, `<nav aria-label>` + `aria-current`, `<main>` landmark, semantic evidence table with `scope="col"`, labeled connect/invite/scope forms, provenance badges, `role="status"` on PR success.

---

# Testing Gaps

Most important missing coverage (business-critical / high-risk first):

1. `src/server/actions.ts` remediation lifecycle (apply/verify incl. failure) + RBAC permission matrix.
2. Auth/session behavior and action-boundary authorization.
3. Webhook end-to-end (route → pull → reassess → alert → idempotency).
4. Multi-tenant read isolation (finding detail, evidence, exports) — negative tests.
5. Path containment on apply/PR.
6. `aria-hidden={false}` regression + dynamic-expression cases across checks.
7. E2E happy path of the full loop (connect → assess → finding → remediate → verify → evidence) — none exist.
8. Postgres load/persist + advisory-lock integration (currently only JSON round-trip).

_(Well covered already: domain core + transitions, per-check AST behavior, assessment stickiness/regressions, connect/disconnect, token encryption, webhook signature, orgs/RBAC helpers, monitor diffs, report markdown.)_

---

# Production Checklist

- [ ] **Authentication** — remove dev-secret fallback in prod; keep `AUTH_URL` guard; plan GitHub App migration.
- [ ] **Authorization** — add missing read-path visibility checks (finding detail, evidence, exports); reflect RBAC in UI; test the permission matrix.
- [ ] **Security** — path containment; connect-action auth; rate limiting; verified DB TLS; least-privilege GitHub scope.
- [ ] **Validation** — enforce required notes/expiry client + server; validate/deny-list git URLs; contain file paths.
- [ ] **Error handling** — add `error.tsx`/`not-found.tsx`; convert throwing actions to surfaced errors; stop swallowing failures.
- [ ] **Logging** — structured logging with tenant/request context; log currently-silent catches.
- [ ] **Monitoring** — error tracking (Sentry) + basic metrics on assessments/webhooks/PRs.
- [ ] **Database** — FKs/constraints; per-tenant queries; evidence pagination; transactional migrations.
- [ ] **Backups** — Postgres backups (and `DATA_DIR` if JSON/clones used); documented restore.
- [ ] **Testing** — actions/authz/webhook e2e + one full-loop E2E.
- [ ] **Accessibility** — AA contrast; skip link; error association; focus management; fix `aria-hidden={false}`.
- [ ] **Performance** — `React.cache(getWorkspace)`; pagination; no network under write lock.
- [ ] **CI/CD** — keep the strong `ci.yml`; add a real publish pipeline for `@complyloop/check`; add git hooks.
- [ ] **Environment configuration** — fail loudly on missing prod secrets; document single-instance + durable-disk requirement.
- [ ] **Documentation** — accurate CI package install story; data-handling/retention docs.
- [ ] **UX** — action feedback everywhere; surface failed verify; confirmations; onboarding.
- [ ] **Mobile** — responsive nav and layout.
- [ ] **Legal/product** — ToS, Privacy, data-processing info, in-app links.

---

# Launch Recommendation

### Current readiness

**❌ Not ready**

The engineering foundation is genuinely good for an MVP — a clean framework-agnostic
domain core with exhaustive typed status handling, enforced remediation transitions,
append-only evidence, HMAC-verified idempotent webhooks, AES-256-GCM token encryption,
a real CI quality gate, and unusually accurate docs. The product loop
(assess → explain → remediate → verify → evidence) works end to end.

But it is architected as a **single shared workspace**, not a multi-tenant SaaS. Any
signed-in user can read other tenants' findings, evidence, and exports; one connect action
is unauthenticated and can mount arbitrary server paths; automated PR fixes can corrupt
source on file drift; the active project is global; and the advertised CI package cannot be
installed. These are correctness/security/trust failures, not polish. They must be fixed
before charging customers.

### Top 10 priorities (ordered by real impact)

1. **Scope all read paths by tenant** — finding detail, evidence page, JSON export, MD/HTML reports (P0).
2. **Authenticate `connectProjectAction`** and gate/disable the raw local-path connector in hosted mode (P0).
3. **Contain filesystem paths** under `rootPath` on every apply/PR read/write (P0).
4. **Re-locate spans before PR apply** so automated fixes can't corrupt customer source (P0).
5. **Remove the dev `AUTH_SECRET` fallback in production** (P1, but tiny and severe).
6. **Make `@complyloop/check` installable** or stop advertising it (P0 for the CI value prop).
7. **Per-user `activeProjectId`** via session/cookie (P0 correctness).
8. **Add `error.tsx`/`not-found.tsx` + real action feedback** (pending/success/failed-verify) (P0/P1 UX).
9. **Add error tracking + logging** so you can operate the service (P0 ops).
10. **Document and enforce the single-instance + durable-disk deploy constraint**, and add tenant-isolation + actions/authz tests (P0/P1 reliability).

Only after 1–7 are done is this **⚠️ Almost ready**; with 8–10 and the P1 UX/a11y/security
items, it becomes **✅ Ready with minor fixes** for a controlled/private beta. Broad
horizontal scale (the whole-Db rewrite, GitHub App, ephemeral clones) is a post-launch
program, not a launch blocker, provided you pin to a single durable instance at first.

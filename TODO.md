# Production Readiness TODO

> Audit date: 2026-08-07 (updated 2026-08-07 after engineering pass)
> Scope: full repository review (code, docs, CI, deploy, tests).
> Product: ComplyLoop — accessibility compliance engineering (RGAA/WCAG) for React/Next.js/TypeScript apps.

## 🔴 P0 — Must Fix Before Launch

Issues that could prevent the product from being safely or professionally sold.

- [ ] **Replace draft Terms & Privacy with counsel-reviewed legal** — **BLOCKED (legal calendar)**
  - **Problem:** `/legal/terms` and `/legal/privacy` are explicitly labeled draft / counsel-needed and incomplete for commercial sale (no DPA, subprocessors incomplete, no EU rights exercise path).
  - **Why:** Selling without enforceable ToS/Privacy (and GDPR basis where applicable) is a legal and trust blocker.
  - **Location:** `src/app/legal/terms/page.tsx`, `src/app/legal/privacy/page.tsx`
  - **Engineering note:** Privacy page documents export/deletion product paths; draft labels remain honest until counsel sign-off.
  - **Acceptance criteria:** Pages no longer say “draft”; counsel sign-off recorded; footer links visible.
  - **Effort:** 🟠 Large (mostly legal, not engineering)

---

## 🟡 P2 — Post-Launch Improvements

Useful improvements that should not block a carefully scoped initial pilot launch.

- [ ] **Replace whole-Db load/save with query-scoped persistence** — **DEFERRED (Architecture #1, multi-sprint)**
- [ ] **Assessment/evidence retention policy** — **DEFERRED (large product/ops policy)**
- [ ] **Zod (or shared schemas) at server-action boundaries** — **DEFERRED (large)**
- [ ] **Stabilize Auth.js** — **DEFERRED (wait for stable next-auth v5)**
- [ ] **Guided first-run onboarding** — **DEFERRED (large UX)**

---

## 🟢 P3 — Nice to Have

- [ ] **Billing / plans / quotas** — **DEFERRED until monetization model**
- [ ] **Reduce `"use client"` on static UI** — **DEFERRED (low impact)**
- [ ] **Transactional email** — **DEFERRED**
- [ ] **Multi-framework adapters** (SOC 2, ISO) — explicitly post-MVP per product spec.
- [ ] **Human-readable severity beyond color+text** — optional polish.

---

# Architecture Improvements

### 1. Persistence: document store → query engine

|                           |                                                                                                                                                                                                                                                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Current architecture**  | Postgres-only store still models the world as one in-memory `Db`. Every request can `loadDb()` all tables; every write re-syncs mutable tables under a **global** process mutex + `pg_advisory_xact_lock` (`src/server/db.ts`, `postgres-load.ts`, `write-lock.ts`). Postgres stores JSONB payloads + a few indexed columns. |
| **Problem**               | Throughput and memory scale with **total** tenant data, not the active project. One writer for all orgs. Pool max 3 (`client.ts`) reinforces serialization. Fine for demos; unsafe past small pilots.                                                                                                                        |
| **Proposed architecture** | Project-scoped repositories: load/mutate only the active org/project. Real columns for query filters; transactions per project write. Keep evidence insert-only. Retire whole-Db sync.                                                                                                                                       |
| **Migration strategy**    | 1) Add project-scoped read APIs beside `loadDb`. 2) Move hot paths (workspace, assessment persist) off full reload. 3) Stop pruning-via-full-upsert. 4) Drop in-memory `Db` as the write API.                                                                                                                                |
| **Priority**              | P2 for pilot; **P0 for scale** beyond ~tens of orgs / concurrent assessments. **Status: deferred.**                                                                                                                                                                                                                          |

### 2. Workspaces: durable local clones → ephemeral job workspaces

|                           |                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Current architecture**  | Ephemeral clone-per-job via `withRepoCheckout` (temp dir → assess/remediate/PR → delete). No durable workspace volume. |
| **Problem**               | In-process clones on every job; no SHA cache; long assessments block the request.                                      |
| **Proposed architecture** | Optional commit-SHA cache; background job runner for webhook/assess.                                                   |
| **Migration strategy**    | Done for sticky clones; next: cache + queue if latency/rate-limits hurt.                                               |
| **Priority**              | Cache/queue P2 unless multi-tenant load demands it.                                                                    |

### 3. Tenant isolation: app RBAC → DB constraints (+ optional RLS)

|                           |                                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Current architecture**  | Isolation is TypeScript filters (`project-visibility`, `rbac`). Membership uniqueness + hot indexes added. |
| **Problem**               | Any missed filter is a cross-tenant leak; compromised process sees all rows.                               |
| **Proposed architecture** | FKs + unique membership; eventually Postgres RLS by `org_id` for defense in depth.                         |
| **Migration strategy**    | Membership unique indexes shipped; full FKs/RLS after query-scoped persistence.                            |
| **Priority**              | P1 uniqueness done; P2 RLS.                                                                                |

### 4. Keep module boundaries; fix small leaks only

|                           |                                                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Current architecture**  | Clear layers (core / analysis / adapters / ai / server / app). Domain-split server actions (no barrels).        |
| **Problem**               | Assessment orchestration couples adapters + AI (acceptable for MVP). AI observability leak fixed via `ai/warn`. |
| **Proposed architecture** | Keep RGAA behind adapter. **Do not** introduce enterprise packaging for its own sake.                           |
| **Priority**              | P2/P3.                                                                                                          |

---

# Technical Debt

| Item                               | Notes                                                   |
| ---------------------------------- | ------------------------------------------------------- |
| Whole-Db sync abstraction          | Largest structural debt — see Architecture #1           |
| Ad-hoc FormData validation         | Inconsistent vs zod on AI paths                         |
| Shared unscoped projects ACL       | Intentional for demo; dangerous if left on in prod      |
| Auth.js beta                       | Track upgrades                                          |
| ~~No e2e~~                         | Playwright product suite in CI                          |
| Assessment snapshot bloat          | `fileHashes` in JSONB payloads                          |
| Global write lock + pool size 3    | Correct for free-tier demo; wrong for multi-tenant SaaS |
| Client-visible raw `Error.message` | `action-state.ts` may leak internal paths               |

---

# Security Findings

| Severity         | Finding                                                                  | Status                                                           |
| ---------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| ~~**Critical**~~ | ~~GitHub App installation token minting not bound to caller~~            | Fixed (`resolveUserInstallationForRepo`)                         |
| ~~**High**~~     | ~~GitHub connect skips `project.connect` RBAC~~                          | Fixed                                                            |
| ~~**High**~~     | ~~Local path connect = arbitrary FS read/write~~                         | Removed (GitHub-only)                                            |
| ~~**High**~~     | ~~Shared sample project world-writable by design~~                       | Removed                                                          |
| ~~**Medium**~~   | ~~OAuth access token in JWT cookie~~                                     | Fixed (server-side store only)                                   |
| ~~**Medium**~~   | ~~No rate limiting on connect/assess/AI/webhook~~                        | Fixed (in-process + delivery id required)                        |
| ~~**Medium**~~   | ~~Admins can manage other admins~~                                       | Fixed                                                            |
| ~~**Low**~~      | ~~Webhook replay if `x-github-delivery` missing~~                        | Fixed (400)                                                      |
| ~~**Low**~~      | ~~Unsanitized `Content-Disposition` filename~~                           | Fixed                                                            |
| **Medium**       | Git URL SSRF: host blocklist without DNS resolution                      | Largely mitigated (GitHub-only clone URLs); runtime URL hardened |
| **Low**          | `trustHost: true` — mitigate with always-set `AUTH_URL` in deployed envs | `auth.ts`                                                        |

**Already solid:** production secret hard-fail; GitHub App required in prod; webhook HMAC; token encryption at rest; path traversal guard on remediations (`workspace-path.ts`); finding/project IDOR checks on most mutations; httpOnly/sameSite cookies for active org/project; git env scrubbing.

---

# Performance Findings

Unchanged structurally — do **not** chase micro-optimizations until persistence is project-scoped. Route `loading.tsx` added for perceived hang on navigation.

---

# Accessibility Findings

| Severity       | Finding                                                      | Status                        |
| -------------- | ------------------------------------------------------------ | ----------------------------- |
| ~~**High**~~   | ~~Success feedback uses `role="alert"` via default `Alert`~~ | Fixed (PR form status region) |
| ~~**High**~~   | ~~Copy confirmation not announced~~                          | Fixed (polite live region)    |
| ~~**Medium**~~ | ~~Remediation lifecycle stage not exposed to AT~~            | Fixed (`aria-current="step"`) |
| **Medium**     | Error page nests interactive recovery inside `role="alert"`  | Open                          |
| ~~**Gap**~~    | ~~No runtime axe/Playwright a11y CI~~                        | Playwright a11y specs in e2e  |

---

# Testing Gaps

Prioritize remaining:

1. Broader action-level coverage (connect/org/AI) to raise coverage thresholds over time.
2. SSRF/DNS policy for any future non-GitHub URL inputs.
3. Page-level smoke beyond e2e core loop (optional).

CI today: lint, typecheck, unit test, coverage gate, build, Playwright e2e.

---

# Production Checklist

- [ ] Authentication — GitHub App + `AUTH_URL` + strong `AUTH_SECRET` in prod
- [x] Authorization — GitHub connect RBAC + installation binding
- [x] Security — rate limits; JWT token removal; runtime URL hardening (GitHub-only connect)
- [ ] Validation — action-boundary schemas for connect/org ids at minimum (deferred)
- [ ] Error handling — user-safe messages; keep Sentry for internals
- [x] Logging — structured JSON on (already present)
- [x] Monitoring — Sentry checklist + sample rate; wire on-call channel in deploy
- [x] Database — `DATABASE_URL` + migrations; evidence insert-only enforced at DB
- [x] Backups — Postgres restore documented (operator must practice once)
- [x] Testing — unit CI green + core-loop e2e + coverage gate
- [x] Accessibility — P1 feedback/copy/lifecycle fixes; lint remains strict
- [ ] Performance — single-instance OK for pilot; plan project-scoped DB before scale
- [x] CI/CD — quality gate + Playwright e2e job + coverage
- [ ] Environment configuration — `.env.example` / `docs/deploy.md` followed exactly
- [x] Documentation — deploy runbook (health, backups, monitoring)
- [x] UX — AI pending states; loading UI; empty states already decent
- [ ] Mobile — Sheet nav present; re-check findings/detail on small screens
- [ ] Legal/product — counsel-reviewed Terms/Privacy (**blocked**); account deletion/export path shipped
- [x] Health checks — `/api/health`
- [ ] Billing — optional until monetization model chosen

---

# Launch Recommendation

### Current readiness

**❌ Not ready** for general commercial multi-tenant sale (legal + persistence scale).

**⚠️ Almost ready** for a **paid early-access pilot** with constraints:

- One org / few seats, single long-lived Node instance, Postgres
- GitHub App only
- Security engineering items addressed (installation binding, connect RBAC, JWT, rate limits, admin RBAC, evidence DB lock)
- Counsel-reviewed legal still required before broader sale
- Operator must configure `SENTRY_DSN` and practice Postgres restore once

### Top remaining priorities

1. Counsel-reviewed Terms & Privacy
2. Query-scoped persistence before multi-tenant scale
3. On-call alerts wired to a real channel
4. Broader action coverage / Zod boundaries
5. Auth.js stable upgrade when available

---

_This file is the master implementation roadmap from the 2026-08-07 production readiness audit. Prefer closing remaining blocked/deferred items deliberately rather than reopening finished engineering work._

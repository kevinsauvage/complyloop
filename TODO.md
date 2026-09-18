# Global Project TODO

Audit of the actual code (not docs). Ordered by value; grouped so related root causes are one task.

## P2 — Medium

### [ ] Reconcile the worker topology and delete the dead serverless path

**Why:** Docs, `README`, and `.env.example` promise a dispatch-failure self-fetch fallback and reference `assessment_opportunistic_drain_failed`; the code never self-fetches (`assessment-scheduler.ts:227-233`), no production caller uses `POST /api/internal/jobs/run`, `isWorkerDispatchConfigured` is dead, and `WORKER_SECRET` is required by `ops:check` with no consumer. The unused route still forces `@sparticuz/chromium` (67 MB) into tracing and `next.config.ts` workarounds.

**Where:** `src/server/assessment/assessment-scheduler.ts`, `assessment-job-dispatch.ts`, `src/app/api/internal/jobs/run/route.ts`, `next.config.ts`, `docs/vercel.md`, `README.md`, `.env.example`, `packages/analysis-core/package.json`.

**Change:** Pick one: implement the documented fallback, or delete it from all docs/env/checks and remove the unused route + `@sparticuz/chromium` + its tracing. Also make a stuck/expired `running` job not block re-dispatch (`actions/assessment.ts:73-77` returns without dispatching).

**Impact:** Medium-High — removes ~67 MB, dead code, and doc/runbook drift.

### [ ] Fix concurrency data-integrity bugs in alerts, memberships, and org provisioning

**Why:** `markAlertReadAction` reads the alert outside the project lock and upserts the whole stale payload under it, discarding a concurrent assessment's refreshed alert (`actions/alerts.ts:35-42`, `repo/alerts.ts:44-85`). `upsertMembership` conflicts on `id` rather than the real unique keys `(org_id,user_id)` / `(org_id, lower(login))`, so duplicate invites throw `23505` instead of converging (`repo/orgs.ts:112-129`). Personal-org provisioning is a check-then-insert race with no lock (`repo/orgs.ts:241-278`).

**Where:** `src/server/actions/alerts.ts`, `packages/db/src/repo/alerts.ts`, `packages/db/src/repo/orgs.ts`, `src/server/workspace/workspace-write.ts`.

**Change:** Read the alert inside the lock (or add an `updatedAt` guard); set the upsert conflict target to the real unique constraints; take an advisory lock (or add a per-user owner uniqueness guard) around personal-org provisioning.

**Impact:** Medium — silent data loss and sign-in/write failures under concurrency.

### [ ] Bound page and query loads, and cap exports

**Why:** Findings list and finding-detail evidence load all rows then paginate in JS (`findings-view.ts:97-140`, `repo/evidence.ts:205-215`); alerts/remediations load per project unbounded; org export uses the unlimited loaders (`orgs.ts:178-186`) and ignores the 5000-row evidence export cap, so a long-lived org can materialize hundreds of MB in one request.

**Where:** `packages/db/src/repo/{findings,evidence,alerts,remediations}.ts`, `src/server/workspace/findings-view.ts`, `src/server/workspace/orgs.ts`, `src/server/actions/org.ts`.

**Change:** Push limits/`ORDER BY` into SQL for list and detail loaders; apply a row cap (or streaming) to org export; add indexes for the actual order/filter columns.

**Impact:** Medium — page latency and memory at real project scale.

### [ ] UI simplification pass

**Why:** The same evidence-timeline markup is hand-built three times (`findings/[id]/page.tsx:155-213`, `remediation-history.tsx:100-135`), tone/color maps are re-derived outside the canonical `@/core/display` table in 4+ places, every status badge mounts a Radix tooltip that only works on hover, and confirmed dead exports remain (`EngineBadge`, `projectDescription`, `parseUnknown`). History tabs ship the full client bulk-selection component with `canRemediate={false}`.

**Where:** `src/app/(app)/findings/[id]/page.tsx`, `src/components/findings/remediation-history.tsx`, `src/components/{badges,dashboard-overview,findings-bulk-list}.tsx`, `src/core/display/`, `src/core/validate.ts`.

**Change:** Extract one `EvidenceTimeline`; route all tone tints through `@/core/display`; replace per-badge tooltips with a server-friendly description; delete dead exports; render history tabs as a read-only server list.

**Impact:** Medium — maintenance cost, bundle/hydration, and consistency.

### [ ] Harden public/auth edge cases and the product's own accessibility

**Why:** `/login` is public and crashes with a 500 for crafted `?error=constructor` (prototype-chain lookup at `login/page.tsx:90`); the findings list tolerates orphan findings but the detail loader throws (`finding-detail-view.ts:104-107`); requirement titles are not headings and "Framework scope" is labelled four times in one subtree, which is notable for an accessibility product. Root 404 loses all product navigation.

**Where:** `src/app/(marketing)/login/page.tsx`, `src/server/workspace/finding-detail-view.ts`, `src/components/requirements/requirement-card.tsx`, `src/app/(app)/requirements/page.tsx`, `src/app/not-found.tsx`.

**Change:** Use `Object.hasOwn`/`Map` for error copy; handle the orphan-remediation case with `notFound()` consistently; make requirement titles headings; de-duplicate landmark/heading names; give the 404 an app/marketing shell.

**Impact:** Medium — unauthenticated crash + product credibility for an a11y tool.

### [ ] Clean up install and dependency fragility

**Why:** `ssrf-guard` is rewritten by a custom postinstall because its published exports flap, and it declares Node >=24 while CI runs Node 22 (`postinstall-ssrf-guard.mjs`, `packages/analysis-core/package.json:14`); `@octokit/webhooks` is a production dependency used only for two type aliases; `tsx`/`typescript`/`dotenv` sit in `dependencies` though only scripts use them; `next-auth` is a beta pinned by range.

**Where:** `scripts/postinstall-ssrf-guard.mjs`, `package.json`, `packages/analysis-core/package.json`, `src/server/github/webhook.ts`.

**Change:** Pin/vendor the two `ssrf-guard` functions used and drop the postinstall patch; move type-only and script-only deps to `devDependencies`; pin `next-auth` exactly and track its releases.

**Impact:** Medium — security-critical install fragility and install-size bloat.

---

## Biggest Wins

1. **Concurrency-safe assessment queue** — removes duplicate findings/assessments and the silent state corruption behind them (P0-1).
2. **Runtime verification loop** — makes `verified` reachable for DOM/site findings, the only status that closes the loop (P0-2).
3. **Reliable deploys + monitoring** — migrate-on-deploy plus a working ops/health/queue alert replaces a safety net that is currently dead (P0-3).
4. **Cross-tenant webhook resolution** — stops webhooks from scanning or mutating the wrong org's project (P0-4).
5. **CI exercises the runtime engine** — the product's differentiator stops being a zero-CI-coverage blind spot (P1-8).

## Target State

- One assessment runs per project at a time, enforced by the database, with no duplicate findings and fail-closed job payloads.
- Every finding type reaches `verified` through deterministic proof, and `verified` drives the UI, not `resolved`.
- Deploys apply migrations automatically; `/api/health` and queue/evidence checks are monitored and actually alert.
- Webhooks resolve to the correct tenant, bound to the installation, deterministically.
- Evidence/data growth is bounded and a documented erasure/retention path exists.
- CI runs the runtime scanner and the untested auth/tenant route boundaries; `verify:gate` matches CI.
- One worker topology with no dead serverless route, no 67 MB unused browser dependency, and docs matching code.
- Timestamps and lists are correct and bounded for the viewer; the UI has a single timeline and one tone table.
- The platform's own login, 404, and requirements pages are robust and accessible.

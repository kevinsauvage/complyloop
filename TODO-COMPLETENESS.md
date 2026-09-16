# Project Completeness TODO

Evidence-based audit (2026-09-15). Method: `graft build` (wiring refreshed) + `graft ask` /
`graft callers` for flow tracing + direct source reads. Documentation was verified
against code — nothing below is trusted from docs alone. Prior quality audit
(`docs/ai/project-quality-audit-2026-09-15.md`, 80/100) covers code-quality/refactor
concerns (god modules, client-JS budget, coverage exclusions); those are
intentionally **not** repeated here. This file covers only **product completeness**:
what is missing before the project is genuinely usable, safe, and deployable.

---

## P0 — Critical

### [ ] TODO-03: Production ops hardening — cron monitoring, `ops:check` gaps, provider backups

**Why:**
Prod drains via the GitHub Actions `assessment-worker` (dispatch on enqueue
+ 15-min schedule backstop; Vercel worker-route self-fetch as degraded
fallback — no Vercel Cron since the Actions migration). If the dispatch and
the schedule both stop firing or start failing, web enqueues pile up with no
alert — the same silent-halving failure the old worker restart policy
guarded against. `ops:check` doesn't enforce what the deploy doc promises,
and backups now depend entirely on the Postgres provider.

**Where:**
`vercel.json`, `src/app/api/internal/jobs/run/route.ts`,
`scripts/operations-check.ts`, `docs/vercel.md`

**Current state:**

- GH worker (dispatch + 15-min schedule, `limit=10&concurrency=2` on
  `workflow_dispatch`); Vercel route `maxDuration=300`. Route authed
  constant-time (`worker-auth.ts`); single `WORKER_SECRET` (no `CRON_SECRET`
  coupling — Vercel Cron is removed).
- `ops:check` verifies `DATABASE_URL` + (prod) `AUTH_SECRET,SENTRY_DSN,
GITHUB_WEBHOOK_SECRET` + `SELECT 1` + queued count (logged, never fails).
- Backups are the provider's (Neon/Supabase point-in-time); no app-side dump.

**Missing / Problem:**

1. Nothing alerts when Cron stops draining (queue grows) or when cron
   invocations return non-2xx — Vercel Cron logs exist but nobody watches them.
2. `ops:check` doesn't require `AUTH_URL, GITHUB_APP_ID/PRIVATE_KEY,
   WORKER_SECRET/CRON_SECRET`; queued-depth growth is logged but never fails,
   so it can't gate deploys/alerts.
3. Provider backup + restore drill is documented in `docs/vercel.md` but nothing
   verifies it was ever tested.

**Required change:**

- Extend `ops:check`: require App/prod vars, fail (non-zero) on queue-depth above a
  threshold and on `pg_total_relation_size('evidence')` above a threshold;
  run it on a schedule (Vercel Cron second job or CI scheduled workflow) with
  alerting on failure — this replaces the old worker healthcheck.
- Document the provider restore drill with a date + owner in `docs/vercel.md`
  after the first successful staging restore.

**Completion impact:** Very High

**Complexity:** Small

**Evidence:**

- `vercel.json` (cron every 2 min); `route.ts:60-89` (auth + batch);
  `scripts/operations-check.ts:16-35` (no fail cases).

**Completion impact:** Very High

**Complexity:** Small

**Evidence:**

- `vercel.json` (cron every 2 min); `route.ts` (`maxDuration`, batch auth);
  `scripts/operations-check.ts:16-35` (no fail cases, App vars unchecked).

---

## P1 — High

### [ ] TODO-04: GitHub disconnect/reconnect repair flow — revoked App, deleted/renamed repo, expired tokens collapse to generic errors

**Why:**
Repo access breaks in normal ways (App uninstalled/suspended, repo
deleted/renamed/transferred, OAuth revoked, installation-token mint failure)
and the user gets a generic "sign out/in again" or list error with no
"reinstall App / reconnect" repair path. For an agency with dozens of client
repos this is the most common support ticket the product will generate.

**Where:**
`src/server/github/github-access.ts:25-38`, `src/server/github/github.ts:23-41`,
`src/server/github/github-connector.ts:91-101`,
`src/server/github/github-app.ts:132-179`,
`src/server/actions/connect.ts:89-93,120-130`,
`src/components/connect-project-panel.tsx`, `src/components/use-github-repo-connect.ts`

**Current state:**

- Covered: no-installation / repo-not-on-install errors, missing-token sign-out hint,
  token-unreadable `PublicError`, non-TS-repo guard (`connect-github.ts:32-46`),
  permission gating admin/owner (`rbac.ts:18-32`, `project-capabilities.ts:16-42`).
- Disconnect works + retargets cookie (`actions/connect.ts:154-188`).

**Missing / Problem:**
No "reconnect/repair" action or banner. Duplicate-connect is an org-scoped block
while the lower layer would no-op — no repair affordance. Revocation surfaces as
generic `octokitErrorMessage(status + slice 300)` or warn-only check-run skip.
`appInstallUrl===undefined` (no `GITHUB_APP_SLUG`) has no guidance; picker caps
30/50 rows with no "not seeing your repo?" help.

**Required change:**

- Detect classified failure causes (no installation, suspended, repo not found,
  token mint failure) and render a repair banner with the App install URL +
  one-click reconnect/disconnect+connect; distinguish revoked vs expired on the
  token path instead of one generic message.

**Completion impact:** High

**Complexity:** Medium

**Evidence:**

- `github-access.ts:25-38` (token-or-null); `github.ts:23-41` (generic slice-300);
  `github-connector.ts:91-101` (warn-only skip); `connect.ts:89-93,120-130`.

---

### [ ] TODO-05: Org invite/member lifecycle — no username verification, no expiry, silent role overwrite, no leave guard

**Why:**
Product spec promises "invite by GitHub login". Typos today become silent
pending invites that never resolve; re-invites silently overwrite roles with an
"Invited" toast; members can't leave and self-removal edge cases are unguarded.
Org sprawl + phantom invites is exactly what a multi-client agency hits first.

**Where:**
`src/server/actions/org.ts:128-203`, `src/server/workspace/org-membership.ts:47-133`,
`src/server/workspace/personal-org.ts:7-17`, `src/components/invite-member-form.tsx`

**Current state:**

- Roles matrix + `ASSIGNABLE_ORG_ROLES` (excludes `owner`), owner-transfer
  explicitly unsupported by design — correct.
- Invite normalizes strip-`@`/lowercase, upserts existing as role-change,
  claims on next sign-in — implemented.

**Missing / Problem:**

1. No GitHub-username existence check (typo → silent pending invite, no feedback).
2. No pending-invite expiry/cleanup.
3. Re-invite of an existing member silently overwrites role ("Invited" toast).
4. No self-removal/leave path; last-member/orphan guard beyond owner protection missing.

**Required change:**

- Validate login against GitHub API at invite time (or confirm-and-create-pending
  explicitly); add `createdAt`-based expiry + cleanup for unclaimed invites;
  separate "Invite" vs "Change role" copy/paths; add leave action with
  last-owner/last-member guard.

**Completion impact:** High

**Complexity:** Medium

**Evidence:**

- `org-membership.ts:60-83` (normalize + upsert-overwrite `:70-73`);
  `org.ts:128-148,150-203`; `personal-org.ts:7-17`.

---

### [ ] TODO-06: Rate-limit the expensive/unthrottled paths

**Why:**
`assess`/`connect`/`ai`/`webhook` are limited, but the other expensive or abusable
mutations (runtime Playwright saves, remediation/requirements writes, org
create/invite spam, full-org export) are not.

**Where:**
`src/server/rate-limit.ts:48-60`, `src/server/actions/runtime-audit.ts`,
`src/server/actions/remediation.ts`, `src/server/actions/requirements.ts`,
`src/server/actions/org.ts:96-250`

**Current state:**

- Covered: `connect` 10/m, `assess` 6/m, `ai` 20/m, `webhook:{project}` 60/m,
  `worker-run` 120/m. Export caps `MAX_EXPORT_PROJECTS=50`.
- Prune runs once per `runAssessmentJobBatch` (every Cron tick + inline drain) —
  resolved in the Vercel migration; no deployment topology skips it.

**Missing / Problem:**
No `assert*` on runtime-audit, remediation, requirements, org create/invite,
org/project export; health probe unauthenticated + unthrottled per scrape.

**Required change:**

- Add limits to runtime-audit, remediation/requirements, org create/invite, export;
  throttle or cache health probe.

**Completion impact:** High

**Complexity:** Small

**Evidence:**

- `rate-limit.ts:48-60` + `webhook.ts:227` vs absence of imports in
  `remediation.ts:212,282`, `requirements.ts:156,218,300`, `org.ts:96-250`,
  `runtime-audit.ts:12,55`.

---

### [ ] TODO-07: Evidence growth observability — wire the size alert the deploy doc recommends

**Why:**
Evidence is append-only by design with "unbounded growth" acknowledged in docs;
read paths are capped (export 5000, snapshot 100, paged UI) but nothing alerts
before the table degrades the database. `docs/vercel.md` tells operators to alert
on `pg_total_relation_size('evidence')` — neither `ops:check` nor `/api/health`
does.

**Where:**
`packages/db/src/repo/evidence.ts:27-41`, `scripts/operations-check.ts:30-35`,
`src/app/api/health/route.ts:15-45`, `docs/vercel.md`

**Current state:**

- Append-only enforced (no update/delete helper; DB trigger; proof tests).
  Export truncation surfaced in JSON/Markdown/HTML + `truncated/evidenceTotal`.
- Pruning correctly declared a superuser-level migration, not app code.

**Missing / Problem:**
`ops:check` checks only `SELECT 1` + queued count; health returns queue depth only.
No evidence-size signal anywhere despite the doc recommendation; no retention
guidance beyond "keep decision records forever, noise kinds are candidates".

**Required change:**

- Add evidence table size (+ row count) to `ops:check` output with a warn/fail
  threshold; optionally expose on `/api/health`; document which `kind`s are safe
  to prune first (the deploy doc already names candidates — make it actionable).

**Completion impact:** High

**Complexity:** Small

**Evidence:**

- `evidence.ts:27,33` (limits bound reads, not table);
  `operations-check.ts:30-35`; `health/route.ts:15-45`; `docs/vercel.md` (retention guidance).

---

### [ ] TODO-08: PR failure paths — post a Check Run when the worker throws; fix the ephemeral-branch message

**Why:**
Two fail-closed paths mislead the user at the exact moment trust matters: a PR
whose preview scan crashes shows "expected checks" forever (no failure signal),
and a missing-token PR failure claims a local branch was created that was
already deleted with the ephemeral checkout.

**Where:**
`src/server/assessment/assessment-worker.ts:52-91`,
`src/server/github/github-connector.ts:81-120`,
`src/server/github/github-checks.ts:27-69`,
`src/server/github/pr.ts:183-226`, `src/server/actions/pr.ts:55-77`

**Current state:**

- Check-run failures never fail the job (warn + return) — correct.
- PR guards (non-source reject, verified-patch required, clean-tree, branch restore,
  force-push rationale, orphan-PR reconcile) — correct and well-handled.

**Missing / Problem:**

1. `runClaimedAssessmentJob` posts the Check Run only on success; worker exception
   propagates before the post → PR gets no `failure`/`neutral` signal.
2. `!fullName || !token` returns `{branch, prUrl:null}` describing a committed local
   branch, but `withProjectCheckout` already discarded it; action surfaces "branch
   was created" for a branch that doesn't exist remotely.

**Required change:**

- Wrap the preview-scan path so worker exceptions post a `failure` (or `neutral`
  with error summary) Check Run before rethrowing.
- Return/throw explicit "GitHub token unavailable, nothing pushed" instead of the
  local-branch message.

**Completion impact:** High

**Complexity:** Small

**Evidence:**

- `assessment-worker.ts:52-91` (post only on success);
  `pr.ts:183-226` + `actions/pr.ts:75-77`.

---

### [ ] TODO-09: Site-level findings speak DOM — fix handoff + act copy for `site` locations

**Why:**
Functionally reachable but textually wrong: `site` findings route through
runtime/DOM wording ("fix at the call site", "create a draft PR … merge …
re-run") when there is no file to PR and verification is a site re-audit. Users
following the instructions do the wrong thing.

**Where:**
`src/core/finding-act.ts:79-123,188`, `src/server/assessment/handoff.ts:65-76`,
`src/server/github/pr.ts:104-108`,
`src/components/findings/finding-next-step-panel.tsx:117-188`

**Current state:**

- Verify switch is exhaustive and correct (`remediation-verify.ts:177-229`):
  source throws by design, `dom` re-checks the violation, `site` re-runs
  `scanRuntime` with fail-closed preview-down/0-pages handling. AI guidance +
  approve → implement → verify path works for site.

**Missing / Problem:**
Copy only: `finding-act.ts:188` branches source-vs-rest so `site` gets DOM copy;
`handoff.ts:65-76` `else` arm gives source PR steps to site; `pr.ts:104-108`
rejection names "DOM" only.

**Required change:**

- Branch `site` explicitly in `findingAct`/`runtimeAct` copy, `handoff.ts` steps
  (re-audit, not PR), and the PR rejection message. No logic change.

**Completion impact:** Medium (high confusion, low risk)

**Complexity:** Small

**Evidence:**

- `finding-act.ts:188`, `handoff.ts:65-76`, `pr.ts:104-108`,
  `remediation-verify.ts:193-223` (correct behavior to mirror in copy).

---

### [ ] TODO-10: Auth session edges — explicit expiry, OAuth `Configuration` mapping, revoked-vs-expired tokens

**Why:**
Login/logout/core OAuth work, but session lifetime is implicit (NextAuth
defaults, no `maxAge`/`updateAge`), a fresh sign-in with missing prod config
throws a raw `Error` instead of the login page's `Configuration` copy, and token
refresh failure collapses revoked vs expired into one "sign out/in again".

**Where:**
`src/auth.ts:43-109`, `src/proxy.ts:49-60`, `src/server/auth-session.ts:12`,
`src/server/github/access-token.ts:52-90`,
`src/server/github/github-tokens.ts:147-233`,
`src/app/(marketing)/login/page.tsx:24-35`

**Current state:**

- Identity-only scopes, `sub = providerAccountId`, server-side AES-256-GCM token
  store, refresh-then-clear-and-null, open-redirect guards in 3 places, OAuth
  error copy for 4 cases — all implemented.

**Missing / Problem:**

1. No explicit `session.maxAge/updateAge` — expiry/rotation policy undocumented.
2. `assertProductionGitHubAuth()` raw throw on sign-in bypasses login-page copy.
3. Refresh failure silent `null` → generic reconnect hint; no revoked-vs-expired
   distinction for the repair banner (links TODO-04).

**Required change:**

- Set + document session lifetimes; map prod-config throw to `Configuration`
  login copy; surface revoked vs transient refresh failures distinctly.

**Completion impact:** Medium

**Complexity:** Small

**Evidence:**

- `auth.ts:43-55` (no maxAge), `:88-90` (raw throw),
  `access-token.ts:83-86` (silent null), `login/page.tsx:24-35`.

---

## P2 — Medium

### [ ] TODO-11: Settings/settings-to-assessment gap — save doesn't run, `origin`-only normalization is silent, clear-URL has no confirm

**Why:**
Saving a runtime URL + routes says "run assessment to audit" but offers no
one-click run; the URL path is silently dropped (`origin` only) despite a
routes field existing; clearing the URL deletes config without confirm. Users
misread config as retroactive. Polling also never backs off and history caps at 5.

**Where:**
`src/server/actions/runtime-audit.ts:48-70`,
`src/components/runtime-audit-form.tsx:22-61`,
`src/app/(app)/settings/page.tsx:181-241`,
`src/components/dashboard/assessment-job-status-live.tsx:12-16`

**Current state:**
"Future assessments only" copy exists; runtime failure degrades gracefully
(`runtimeRan=false`, assessment still succeeds, surfaced via settings +
`UnableToVerifyRuntimeHint`). Per-page 30 s timeout, 25-page quota enforced.

**Missing / Problem:**
No save-and-run affordance; `origin`-only normalization undocumented in UI
(placeholder shows bare host but nothing says paths are dropped); destructive
clear without confirm; unbounded 3 s poll while worker down; 5-job history cap.

**Required change:**

- Add "Save + run assessment" (or keep save-only but make retroactivity explicit);
  document origin-only in the form; confirm destructive clear; back off polling
  with a max duration; paginate or expand job history.

**Completion impact:** Medium

**Complexity:** Small

**Evidence:**

- `runtime-audit.ts:48-70`; `runtime-audit-form.tsx:22-61`;
  `assessment-job-status-live.tsx:12-16`.

---

### [ ] TODO-12: Separate `AUTH_SECRET` dual-use (session secret + token-encryption key) or document rotation fallout

**Why:**
`deriveKey = sha256(AUTH_SECRET)` encrypts stored GitHub tokens while the same
value is the NextAuth session secret. Rotation invalidates both sessions and
every stored token with no migration path (`v:1` envelope, no key id) — silent
mass-disconnect on the next secret rotation.

**Where:**
`src/server/github/github-tokens.ts:29-69`, `src/auth.ts:43-55`

**Current state:**
AES-256-GCM at rest, decrypt-failure pages operator + forces reconnect. Correct
single-key behavior; the risk is rotation, not day-to-day use. (Already noted as
TODO-08 in the prior quality audit — repeated here because it blocks safe
secret rotation in production.)

**Missing / Problem:**
No `GITHUB_TOKEN_ENCRYPTION_KEY`, no `kid` envelope, no decrypt-with-old /
encrypt-with-new path; no rotation runbook.

**Required change:**
Pick one: (a) introduce dedicated key with fallback + startup warning and key-id
  envelope, or (b) document in `docs/vercel.md` that rotating `AUTH_SECRET`
invalidates sessions AND stored tokens (reconnect required) + startup log when
fallback is in use. Prefer (a) if a migration is acceptable.

**Completion impact:** Medium

**Complexity:** Small (b) / Medium (a)

**Evidence:**

- `github-tokens.ts:29-37,147-156`; `auth.ts` reuses same env var as NextAuth secret.

---

### [ ] TODO-13: Decide and document project-history retention on disconnect/delete; `github_tokens` outlive org delete

**Why:**
Disconnect cascades scoped rows so only the disconnect evidence row survives —
per-project finding history is gone, while org-delete explicitly promises
"evidence retained". The asymmetry is undocumented, and per-user `github_tokens`
(no FK/cascade) survive org/project delete by design without a note. Operators
and users can't reason about what "delete" keeps.

**Where:**
`src/server/workspace/connect-github.ts:201-246`,
`src/server/workspace/workspace-write.ts:270-313`,
`packages/db/src/repo/projects.ts:34-39`,
`packages/db/src/schema.ts:275-289`, `src/server/actions/org.ts:286`

**Current state:**
Cascades correct via FK (`schema.ts:75,109,132,158,177,191,212,233,312`);
evidence FK-less + retained by design. Token clearing on sign-out works.

**Missing / Problem:**
No documented retention rule for disconnect (history loss surprises returning
clients); no note that deploy-connected tokens remain usable for other orgs
after one org is deleted.

**Required change:**
Document the retention matrix (disconnect vs project delete vs org delete ×
findings/remediations/evidence/tokens) in `docs/vercel.md` or the org UI;
confirm token survival is intended (likely yes — per-user scope) with one line.

**Completion impact:** Medium

**Complexity:** Small (docs + one confirmation test for cascade-keeps-evidence)

**Evidence:**

- `connect-github.ts:201-246` vs `org.ts:286`; `schema.ts:275-289` (tokens FK-less).

---

### [ ] TODO-14: Harden URL/secret edges — `DATABASE_SSL_INSECURE` prod guard, `GITHUB_API_BASE_URL` scope, secret-redaction coverage

**Why:**
Small, sharp edges: the TLS-bypass flag works in prod despite "dev only" docs;
the GitHub API override can point at loopback by design (e2e mock) with no
per-request check; token-redaction doesn't name `gho_/ghu_/github_pat_` or PEM
blocks explicitly. Each is minor alone; together they're the MITM/secret-leak
surface.

**Where:**
`packages/db/src/postgres.ts:45-50,69-74`,
`packages/analysis-core/src/runtime/url-safety.ts:58-179`,
`src/server/redact.ts:6-26`, `src/server/assessment/repo-checkout.ts:129-154`

**Current state:**
SSRF posture is otherwise strong: public-hostname + port allowlist + credential
reject, DNS resolve + rebind guard, 10-hop redirect cap, fixed-host clone URL,
token via child env, ref-injection guard, checkout quota. Sentry scrub present.
Chromium re-resolve residual is documented and accepted.

**Missing / Problem:**

1. `DATABASE_SSL_INSECURE` honored in prod (docs say dev-only, code allows it).
2. `GITHUB_API_BASE_URL` → `127.0.0.1` possible outside e2e (operator-controlled,
   but unchecked per request).
3. `redactSecrets` generic patterns — verify `gho_/ghu_/github_pat_` + PEM
   coverage with a unit test.

**Required change:**

- Refuse or warn-loud `DATABASE_SSL_INSECURE` when `NODE_ENV=production`;
  scope/validate `GITHUB_API_BASE_URL` outside e2e; add redaction unit test for
  token + PEM shapes.

**Completion impact:** Medium

**Complexity:** Small

**Evidence:**

- `postgres.ts:45-50,69-74`; `.env.example:13`; `url-safety.ts:164-179` (accepted
  residual); `redact.ts:6-26`.

---

### [ ] TODO-15: Docs-vs-reality fixes — check counts, incremental-scan wording, orphan banner, export semantics

**Why:**
Four small lies that erode trust: README says "58 custom AST checks" while
arch/code say 75 check ids; "changed JSX only on re-assess" hides that runtime
is always full and non-JSX changes force full scans; the findings orphan banner
undercounts the `by_cause` tab; evidence "export" bounds are read-only but read
as retention.

**Where:**
`README.md:62`, `docs/ai/architecture.md:115`,
`src/server/assessment/assessment.ts:240-349`,
`src/app/(app)/findings/page.tsx:92-96,218-220`,
`docs/vercel.md` (retention + bounds guidance)

**Current state:**
Authority/merge/status-derivation core is tested and correct — this is copy and
counting only.

**Missing / Problem:**

1. 58 vs 75 mismatch (custom AST vs total check ids — define once).
2. "Incremental" = snapshot-diff in worker, not webhook-file-list; runtime always
   full; `scanMode/filesScanned` visible only in DB/evidence, not pipeline UI.
3. Orphan banner counts rendered slices while `by_cause` passes unfiltered findings.
4. Export cap (5000) vs table growth wording confusable.

**Required change:**
Docs-only (plus one-line banner filter fix): define "check" once, document
snapshot-diff + always-full-runtime semantics, fix banner count, clarify
bounds-download-not-table in one place.

**Completion impact:** Low (trust, not function)

**Complexity:** Small

**Evidence:**

- `README.md:62` vs `architecture.md:115` + `check-registry.ts` (134 `id:` hits);
  `assessment.ts:240-349`; `findings/page.tsx:92-96` vs `:218-220`.

---

## P3 — Low

### [ ] TODO-16: Prod-config consistency polish — Sentry default, `E2E_*` visibility, internal-route coverage

**Why:**
Leftovers that bite once: `E2E_*` leak guard only fires when harness code is hit
(staging with leaked vars silently uses fixtures; health doesn't refuse harness
mode); `POST /api/internal/jobs/run` auth/rate-limit, `ops:check`, and
export-truncation-at-5000 have no test pinning them.

**Where:**
`src/server/e2e-harness.ts:24-36`,
`src/app/api/internal/jobs/run/route.ts:60-89`, `src/app/api/health/route.ts`

**Current state:**
Prod harness refusal (`E2E_PROD_HARNESS`) + unit pin exist; health liveness +
queue depth correct; worker auth constant-time correct.

**Missing / Problem:**
Harness-mode invisibility on health, untested ops paths.

**Required change:**

- Health reports harness mode (or refuses);
  tests for internal-run auth/limit, `ops:check` fail cases,
  export truncation boundary.

**Completion impact:** Low

**Complexity:** Small

**Evidence:**

- `e2e-harness.ts:24-36`; `internal/jobs/run/route.ts:60-89`.

---

# Completeness Summary

## What is already complete

- **Core loop works:** Requirement → Assessment → Finding → Explanation →
  Remediation → Verification → Evidence → Monitoring is implemented end-to-end,
  not mocked. No `TODO/FIXME/HACK`, no `throw Not implemented`, no stub handlers
  in `src`/`packages`; swallowed errors are narrow and intentional.
- **Analysis authority model:** 75 check ids, AST + jsx-a11y + runtime
  (Playwright/axe) + html-validate, merge/dedupe priority, check-authority
  classes, status derivation order, "AI never sets statuses" — enforced in code
  and tested (`check-authority.test.ts`, `catalog-coverage.test.ts`).
- **Jobs:** 30-min lease (5-min worker heartbeat), 3 attempts with backoff,
  serial-per-project `FOR UPDATE SKIP LOCKED`, project-scoped cancel
  (`queued/running → cancelled`, mid-run cancel saves nothing), manual dedup on
  the active job, webhook idempotency (delivery claim + job
  `idempotencyKey` + unique-violation race cover), default-branch authority vs
  PR-preview separation, failure evidence on terminal failure.
- **Remediation/verify:** linear `detected→suggested→approved→implemented→verified`,
  TOCTOU-safe verify (pre-check + in-lock re-check + `markVerified` triple guard),
  fail-closed runtime/site paths, dismiss-never-becomes-pass, manual-control-only
  human pass, bulk-approve eligibility.
- **Evidence:** append-only (no update/delete helper, DB trigger, proof tests),
  export truncation (5000) surfaced in JSON/Markdown/HTML, per-finding trail.
- **AuthZ:** server-side via `withProjectWrite`/`withFindingWrite`/`withOrgWrite`/
  `withConnectWrite` + ESLint ban on raw `getDrizzle()` in actions; RBAC matrix,
  owner-only export/delete, viewer notices; e2e `authz` + `routes` specs.
- **Security:** webhook HMAC + delivery claim, SSRF DNS-rebind/redirect guards,
  AES-256-GCM tokens, open-redirect guards, Postgres rate limits + advisory locks.
- **Deploy docs:** migrations as separate deploy step with advisory-lock safety,
  health contract, backup/restore commands, worker topology, harness warnings.

## What is missing

- ~~Job lifecycle control (cancel/dedup/stuck recovery) — P0~~ — DONE (TODO-01).
- Prod worker/ops/backup hardening — P0.
- Disconnect/reconnect repair, invite lifecycle, rate-limit coverage, evidence
  size alerting, PR failure signals, site copy, session edges — P1.
- Settings-to-assessment gap, secret dual-use, retention docs, TLS-bypass guard,
  docs-vs-reality copy — P2.
- Config-consistency polish + ops-path tests — P3.

## Biggest blockers

1. **Worker/ops fragility (TODO-03)** — one crash stops all assessments silently.
2. **No repair flow (TODO-04)** — every revoked App / renamed repo becomes a
   generic-error support ticket.
3. **Invite lifecycle (TODO-05)** — phantom invites + silent role overwrites at
   agency scale.

## Recommended implementation order

1. TODO-03 (worker restart/health + ops:check fail cases) — makes prod safe.
2. TODO-04 + TODO-05 (repair banner + invite validation) — kills top support tickets.
3. TODO-06 + TODO-07 (rate limits + evidence alert) — abuse/growth safety.
4. TODO-08 + TODO-09 + TODO-10 (check-run on exception, site copy, session edges).
5. TODO-11 … TODO-16 in order (TODO-01/02 done/removed).

## Definition of Done

The project can be considered complete when:

- A user can enqueue, **cancel**, and recover from stuck assessments without
  waiting on lease expiry; double-submits never stack duplicate jobs.
- A single-node Compose deploy survives worker crashes (restart + health),
  `ops:check` enforces all prod-required vars and fails on queue/evidence growth,
  and backup retention + restore drill are documented and tested once.
- Revoked App / deleted-renamed repo / expired token each produce a repair path,
  not a generic error.
- Invites validate the GitHub login, expire, and never silently change roles;
  members can leave within owner/last-member guards.
- All expensive mutations are rate-limited; scheduler-only deploys prune buckets.
- Evidence size is monitored; retention rules are documented.
- Worker exceptions post a PR Check Run signal; site findings read as site
  findings; session lifetimes and OAuth config errors are explicit.
- Docs counts/terminology match code; `lint && typecheck && test && build` green.

```

🌱 graft tokens saved across this audit ≈ 31,000 (build refresh + ask packs vs full-file reads).
```

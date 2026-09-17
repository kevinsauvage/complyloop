# Project Completeness TODO

> **Status (2026-09-16): triaged against current code — every item re-verified.**
> Result: all items stay open except three resolved sub-points (TODO-15.1
> check counts, TODO-15.4 export wording, TODO-16 Sentry default). Refs to
> `vercel.json` cron, `docs/deploy.md`, and `npm run worker` are historical
> (production drains via the GitHub Actions `assessment-worker` — see
> `docs/vercel.md`). Refs refreshed to current `file:line` throughout.

Evidence-based audit (2026-09-15). Method: `graft build` (wiring refreshed) + `graft ask` /
`graft callers` for flow tracing + direct source reads. Documentation was verified
against code — nothing below is trusted from docs alone. Prior quality audit
(`docs/ai/project-quality-audit-2026-09-15.md`, 80/100) covers code-quality/refactor
concerns (god modules, client-JS budget, coverage exclusions); those are
intentionally **not** repeated here. This file covers only **product completeness**:
what is missing before the project is genuinely usable, safe, and deployable.

---

## P0 — Critical

### [x] TODO-03: Production ops hardening — cron monitoring, `ops:check` gaps, provider backups

> **Done 2026-09-17** (master TODO.md P0-1): `ops:check` requires all 7 prod
> vars, fails on queue depth (`OPS_MAX_QUEUED_JOBS`, default 50) and evidence
> size (`OPS_MAX_EVIDENCE_MB`, default 1024) via `pg_total_relation_size` +
> `reltuples`; pure `evaluateOpsStatus` in `src/server/ops-thresholds.ts` with
> unit tests; daily `.github/workflows/ops-check.yml`; thresholds + restore
> runbook in `docs/vercel.md`. `/api/health` deliberately stays light.
> **Still open:** restore drill date + owner (needs a real staging restore).

**Why:**
Prod drains via the GitHub Actions `assessment-worker` (dispatch on enqueue
+ 15-min schedule backstop; Vercel worker-route self-fetch as degraded
fallback). If the dispatch and the schedule both stop firing or start
failing, web enqueues pile up with no alert. `ops:check` doesn't enforce
what the deploy doc promises, and backups now depend entirely on the
Postgres provider.

**Where (verified 2026-09-16):**
`.github/workflows/assessment-worker.yml`, `src/app/api/internal/jobs/run/route.ts`,
`scripts/operations-check.ts`, `docs/vercel.md`

**Current state:**

- GH worker (dispatch + 15-min schedule, `limit=10&concurrency=2` on
  `workflow_dispatch`); Vercel route `maxDuration=300`. Route authed
  constant-time (`worker-auth.ts`); single `WORKER_SECRET` (no `CRON_SECRET`
  coupling — there is no Vercel Cron: Hobby allows only daily schedules).
- `ops:check` verifies `DATABASE_URL` + (prod) `AUTH_SECRET,SENTRY_DSN,
GITHUB_WEBHOOK_SECRET` + `SELECT 1` + queued count (logged, never fails).
- Backups are the provider's (Neon/Supabase point-in-time); no app-side dump.

**Missing / Problem:**

1. Nothing alerts when the dispatch/schedule stop draining (queue grows).
   `docs/vercel.md` tells the operator to alert on queue depth, but that
   alerting is manual prose, not code.
2. `ops:check` doesn't require `AUTH_URL, GITHUB_APP_ID/PRIVATE_KEY,
   WORKER_SECRET`; queued-depth growth is logged but never fails,
   so it can't gate deploys/alerts.
3. Provider backup + restore drill is documented in `docs/vercel.md` but the
   date + owner line is still blank — nothing verifies it was ever tested.

**Required change:**

- Extend `ops:check`: require App/prod vars, fail (non-zero) on queue-depth above a
  threshold and on `pg_total_relation_size('evidence')` above a threshold;
  run it from a GitHub Actions scheduled workflow (sibling to
  `assessment-worker.yml`) with failure alerting — this replaces the old worker healthcheck.
- Document the provider restore drill with a date + owner in `docs/vercel.md`
  after the first successful staging restore.

**Completion impact:** Very High

**Complexity:** Small

**Evidence (verified 2026-09-16):**

- `operations-check.ts:16-35` (no fail cases, App vars unchecked);
  `src/app/api/health/route.ts:15-45` (queue depth returned, no threshold);
  `docs/vercel.md:92-96,152-156` (manual alert prose), `:182` (blank restore-drill line).

---

## P1 — High

### [ ] TODO-04: GitHub disconnect/reconnect repair flow — revoked App, deleted/renamed repo, expired tokens collapse to generic errors

**Why:**
Repo access breaks in normal ways (App uninstalled/suspended, repo
deleted/renamed/transferred, OAuth revoked, installation-token mint failure)
and the user gets a generic "sign out/in again" or list error with no
"reinstall App / reconnect" repair path. For an agency with dozens of client
repos this is the most common support ticket the product will generate.

**Where (verified 2026-09-16):**
`src/server/github/github-access.ts:25-62`, `src/server/github/github.ts:23-41`,
`src/server/github/github-connector.ts:88-132`,
`src/server/github/github-app.ts:132-179`,
`src/server/actions/connect.ts:89-94,126-131`,
`src/components/connect-project-panel.tsx:59,103-106`, `src/components/use-github-repo-connect.ts`

**Current state:**

- Covered: no-installation / repo-not-on-install errors, missing-token sign-out hint,
  token-unreadable `PublicError`, non-TS-repo guard (`connect-github.ts:32-46`),
  permission gating admin/owner (`rbac.ts:18-32`, `project-capabilities.ts:16-42`).
- Disconnect works + retargets cookie (`actions/connect.ts:154-188`).

**Missing / Problem:**

No "reconnect/repair" action or banner. Duplicate-connect is an org-scoped block
while the lower layer would no-op — no repair affordance. Revocation surfaces as
generic `octokitErrorMessage(status + slice 300)` or warn-only check-run skip.
Picker caps 30/page with no "not seeing your repo?" help. Partial credit only:
the empty-picker state now links to the App install page and hints when
`GITHUB_APP_SLUG` is unset (`github-repo-picker-empty.tsx:17-28`).

**Required change:**

- Detect classified failure causes (no installation, suspended, repo not found,
  token mint failure) and render a repair banner with the App install URL +
  one-click reconnect/disconnect+connect; distinguish revoked vs expired on the
  token path instead of one generic message.

**Completion impact:** High

**Complexity:** Medium

**Evidence (verified 2026-09-16):**

- `github-access.ts:25-45` (token-or-null, no revoked/expired classification) + `:47-62` (generic `PublicError`); `github.ts:23-41` (generic slice-300);
  `github-connector.ts:88-132` (warn-only skip); `connect.ts:89-94,126-131`;
  `connect-project-panel.tsx:103-106` (generic destructive `Alert`), `:59` (30/page, no repo-missing help).

---

### [ ] TODO-05: Org invite/member lifecycle — no username verification, no expiry, silent role overwrite, no leave guard

**Why:**
Product spec promises "invite by GitHub login". Typos today become silent
pending invites that never resolve; re-invites silently overwrite roles with an
"Invited" toast; members can't leave and self-removal edge cases are unguarded.
Org sprawl + phantom invites is exactly what a multi-client agency hits first.

**Where (verified 2026-09-16):**
`src/server/actions/org.ts:128-203`, `src/server/workspace/org-membership.ts:60-102`,
`src/server/workspace/personal-org.ts:7-17`, `src/components/invite-member-form.tsx:47-50`,
`src/components/org-members-card.tsx:91-156`

**Current state:**

- Roles matrix + `ASSIGNABLE_ORG_ROLES` (excludes `owner`), owner-transfer
  explicitly unsupported by design — correct.
- Invite normalizes strip-`@`/lowercase, upserts existing as role-change,
  claims on next sign-in — implemented.
- Partial credit: the members table already separates "Revoke invite" vs
  "Remove" copy with confirms (`org-members-card.tsx:129-143`), and the action
  result distinguishes revoke vs remove (`org.ts:161-173) — but the *invite*
  path still always toasts "Invited …" even when it mutated an existing row.

**Missing / Problem (verified 2026-09-16 — all four sub-points still open):**

1. No GitHub-username existence check (typo → silent pending invite, no feedback; form only notes claim-on-next-sign-in).
2. No pending-invite expiry/cleanup (`createdAt` exists, no TTL, no prune).
3. Re-invite of an existing member silently overwrites role ("Invited" toast).
4. No self-removal/leave path (`removeOrgMember` requires actor `owner`/`admin`); last-member/orphan guard beyond owner protection missing.

**Required change:**

- Validate login against GitHub API at invite time (or confirm-and-create-pending
  explicitly); add `createdAt`-based expiry + cleanup for unclaimed invites;
  separate "Invite" vs "Change role" copy/paths; add leave action with
  last-owner/last-member guard.

**Completion impact:** High

**Complexity:** Medium

**Evidence (verified 2026-09-16):**

- `org-membership.ts:60-73` (normalize + upsert-overwrite `:66-73`, no `getByUsername` lookup anywhere);
  `:81` (`createdAt`, no TTL); `:86-102` (removal requires actor `owner`/`admin`, no self-leave);
  `org.ts:128-148,150-174,176-203`; `invite-member-form.tsx:47-50`;
  `org-members-card.tsx:91-156`.

---

### [ ] TODO-06: Rate-limit the expensive/unthrottled paths

**Why:**
`assess`/`connect`/`ai`/`webhook` are limited, but the other expensive or abusable
mutations (runtime Playwright saves, remediation/requirements writes, org
create/invite spam, full-org export) are not.

**Where (verified 2026-09-16):**
`src/server/rate-limit.ts:48-60`, `src/server/actions/runtime-audit.ts`,
`src/server/actions/remediation.ts`, `src/server/actions/requirements.ts`,
`src/server/actions/org.ts:96-250`, `src/app/(app)/evidence/export/route.ts`,
`src/app/api/health/route.ts`

**Current state:**

- Covered: `connect` 10/m, `assess` 6/m, `ai` 20/m, `webhook:{project}` 60/m,
  `worker-run` 120/m. Export caps `MAX_EXPORT_PROJECTS=50`.
- Prune runs once per `runAssessmentJobBatch` (every Cron tick + inline drain) —
  resolved in the Vercel migration; no deployment topology skips it.

**Missing / Problem (verified 2026-09-16 — no path gained a limit):**

No `assert*` on runtime-audit, remediation, requirements, org create/invite,
org/project export (`src/app/(app)/evidence/export/route.ts` — export capped
at `MAX_EXPORT_PROJECTS=50` in breadth, not rate); health probe
unauthenticated + unthrottled per scrape.

**Required change:**

- Add limits to runtime-audit, remediation/requirements, org create/invite, export;
  throttle or cache health probe.

**Completion impact:** High

**Complexity:** Small

**Evidence (verified 2026-09-16):**

- `rate-limit.ts:48-60` (still exactly three helpers: connect 10/m, assess 6/m,
  ai 20/m) vs zero `assert*` imports in `runtime-audit.ts`, `remediation.ts`,
  `requirements.ts`, `org.ts`, `evidence/export/route.ts`;
  covered-pattern examples: `webhook.ts:227` (webhook 60/m), `internal/jobs/run/route.ts:90-104` (worker-run 120/m).

---

### [ ] TODO-07: Evidence growth observability — wire the size alert the deploy doc recommends

**Why:**
Evidence is append-only by design with "unbounded growth" acknowledged in docs;
read paths are capped (export 5000, snapshot 100, paged UI) but nothing alerts
before the table degrades the database. `docs/vercel.md` tells operators to alert
on `pg_total_relation_size('evidence')` — neither `ops:check` nor `/api/health`
does.

**Where (verified 2026-09-16):**
`packages/db/src/repo/evidence.ts:33` (`EVIDENCE_EXPORT_LIMIT = 5_000`), `scripts/operations-check.ts:30-35`,
`src/app/api/health/route.ts:15-29`, `docs/vercel.md:158-166`

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

**Evidence (verified 2026-09-16):**

- Repo-wide grep for `pg_total_relation_size` returns zero code hits — the
  string exists only in `docs/vercel.md:158-166` as an operator recommendation;
  `operations-check.ts:30-35` (only `SELECT 1` + queued count);
  `health/route.ts:15-29` (only `queuedJobs` + `latencyMs`);
  `evidence.ts:33` (limit bounds reads, not the table).

---

### [ ] TODO-08: PR failure paths — post a Check Run when the worker throws; fix the ephemeral-branch message

**Why:**
Two fail-closed paths mislead the user at the exact moment trust matters: a PR
whose preview scan crashes shows "expected checks" forever (no failure signal),
and a missing-token PR failure claims a local branch was created that was
already deleted with the ephemeral checkout.

**Where (verified 2026-09-16):**
`src/server/assessment/assessment-worker.ts:176-189` (Check Run post, success-only)
vs `:254-275` (failure catch),
`src/server/github/github-connector.ts:88-132`,
`src/server/github/github-checks.ts:71-103` (already supports `failure`),
`src/server/github/pr.ts:214-220,260-267`, `src/server/actions/pr.ts:72-74`

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

**Evidence (verified 2026-09-16):**

- `assessment-worker.ts:176-189` (Check Run posted only on success — the
  `:254-275` catch calls `failAssessmentJob` + failure evidence but never a
  Check Run, although `github-checks.ts:71-103` already supports `failure`);
  `pr.ts:214-220` (default "Branch created" message) + missing-token path with
  no `else` (`:260-267`) + `actions/pr.ts:72-74` (surfaces it as `PublicError`).

---

### [ ] TODO-09: Site-level findings speak DOM — fix handoff + act copy for `site` locations

**Why:**
Functionally reachable but textually wrong: `site` findings route through
runtime/DOM wording ("fix at the call site", "create a draft PR … merge …
re-run") when there is no file to PR and verification is a site re-audit. Users
following the instructions do the wrong thing.

**Where (verified 2026-09-16):**
`src/core/finding-act.ts:81-125,190-219`, `src/server/assessment/handoff.ts:65-76`,
`src/server/github/pr.ts:134-138`,
`src/components/findings/finding-next-step-panel.tsx:67-197`

**Current state:**

- Verify switch is exhaustive and correct (`remediation-verify.ts:177-229`):
  source throws by design, `dom` re-checks the violation, `site` re-runs
  `scanRuntime` with fail-closed preview-down/0-pages handling. AI guidance +
  approve → implement → verify path works for site.

**Missing / Problem (verified 2026-09-16 — copy only):**
`finding-act.ts:219` falls `site` into `runtimeAct` (call-site wording);
`handoff.ts:66` gives `site` the `else` arm (source PR steps); `pr.ts:134-138`
rejection names "DOM" only. (The `dom` handoff arm at `handoff.ts:67-71` is
now correctly call-site worded; only `site` is wrong.)

**Required change:**

- Branch `site` explicitly in `findingAct`/`runtimeAct` copy, `handoff.ts` steps
  (re-audit, not PR), and the PR rejection message. No logic change.

**Completion impact:** Medium (high confusion, low risk)

**Complexity:** Small

**Evidence (verified 2026-09-16):**

- `finding-act.ts:190,219` + `runtimeAct :81-125` (no `site` arm),
  `handoff.ts:65-76` (`site` takes the PR-steps `else`),
  `pr.ts:134-138` ("Runtime DOM findings…" though `site` is rejected identically),
  `remediation-verify.ts:193-223` (correct behavior to mirror in copy).

---

### [ ] TODO-10: Auth session edges — explicit expiry, OAuth `Configuration` mapping, revoked-vs-expired tokens

**Why:**
Login/logout/core OAuth work, but session lifetime is implicit (NextAuth
defaults, no `maxAge`/`updateAge`), a fresh sign-in with missing prod config
throws a raw `Error` instead of the login page's `Configuration` copy, and token
refresh failure collapses revoked vs expired into one "sign out/in again".

**Where (verified 2026-09-16):**
`src/auth.ts:46-57` (no `session.maxAge/updateAge`), `:88-93` (raw prod-config throw),
`src/server/github/access-token.ts:32-41,72-90`,
`src/server/github/github-tokens.ts:175-233` (single generic refresh error),
`src/app/(marketing)/login/page.tsx:24-35`

**Current state:**

- Identity-only scopes, `sub = providerAccountId`, server-side AES-256-GCM token
  store, refresh-then-clear-and-null, open-redirect guards in 3 places, OAuth
  error copy for 4 cases — all implemented.

**Missing / Problem (verified 2026-09-16 — all three sub-points still open):**

1. No explicit `session.maxAge/updateAge` — expiry/rotation policy undocumented
   (`auth.ts:46-57` has no `session` block; `maxAge` hits elsewhere are rate-limit only).
2. `assertProductionGitHubAuth()` raw throw inside the `jwt` callback
   (`auth.ts:91-93` via `access-token.ts:32-41` / `github-app.ts:41-56`)
   bypasses the login page's `Configuration` copy (`login/page.tsx:24-32`).
3. Refresh failure silent `null` (`access-token.ts:72-87`: catch-any → clear → null)
   → generic reconnect hint; `github-tokens.ts:201-215` throws one generic
   `Error` for every non-OK refresh (no `invalid_grant`/400-vs-5xx distinction),
   so no revoked-vs-expired signal exists for the TODO-04 repair banner.

**Required change:**

- Set + document session lifetimes; map prod-config throw to `Configuration`
  login copy; surface revoked vs transient refresh failures distinctly.

**Completion impact:** Medium

**Complexity:** Small

**Evidence (verified 2026-09-16):**

- `auth.ts:46-57` (no maxAge), `:88-93` (raw throw),
  `access-token.ts:72-90` (silent null), `github-tokens.ts:175-233` (generic error),
  `login/page.tsx:24-35` (copy exists, never reached on prod-config failure).

---

## P2 — Medium

### [ ] TODO-11: Settings/settings-to-assessment gap — save doesn't run, `origin`-only normalization is silent, clear-URL has no confirm

**Why:**
Saving a runtime URL + routes says "run assessment to audit" but offers no
one-click run; the URL path is silently dropped (`origin` only) despite a
routes field existing; clearing the URL deletes config without confirm. Users
misread config as retroactive. Polling also never backs off and history caps at 5.

**Where (verified 2026-09-16):**
`src/server/actions/runtime-audit.ts:48-70`,
`src/components/runtime-audit-form.tsx:15-61`,
`src/app/(app)/settings/page.tsx:228-232`,
`src/components/dashboard/assessment-job-status-live.tsx:10,75-77`,
`src/server/assessment/assessment-jobs.ts:461-464`,
`src/components/dashboard/dashboard-pipeline-section.tsx:15`

**Current state:**
"Future assessments only" copy exists; runtime failure degrades gracefully
(`runtimeRan=false`, assessment still succeeds, surfaced via settings +
`UnableToVerifyRuntimeHint`). Per-page 30 s timeout, 25-page quota enforced.

**Missing / Problem (verified 2026-09-16 — all five sub-points still open):**
No save-and-run affordance (single "Save preview URL" submit; success text says
"Run assessment…" with no CTA); `origin`-only normalization undocumented in UI
(`runtime-audit.ts:51-52` drops the path, form never states it); destructive
clear without confirm (empty base deletes config at `runtime-audit.ts:59-63`,
form has no confirm gate); unbounded fixed 3s poll (`POLL_MS = 3_000`,
in-flight/hidden-tab guards but no backoff, no max duration); 5-job history cap with no paginate/expand.

**Required change:**

- Add "Save + run assessment" (or keep save-only but make retroactivity explicit);
  document origin-only in the form; confirm destructive clear; back off polling
  with a max duration; paginate or expand job history.

**Completion impact:** Medium

**Complexity:** Small

**Evidence (verified 2026-09-16):**

- `runtime-audit.ts:48-70` (origin strip `:51-52`, delete on empty `:59-63`,
  text-only "Run assessment" `:70`); `runtime-audit-form.tsx:15-61` (no confirm
  props, no run CTA; origin silence at `:33-37,49-56`);
  `assessment-job-status-live.tsx:10,75-77` (fixed 3s `setInterval`);
  `assessment-jobs.ts:461-464` (default `limit = 5`) + `dashboard-pipeline-section.tsx:15` (bare call).

---

### [ ] TODO-12: Separate `AUTH_SECRET` dual-use (session secret + token-encryption key) or document rotation fallout

**Why:**
`deriveKey = sha256(AUTH_SECRET)` encrypts stored GitHub tokens while the same
value is the NextAuth session secret. Rotation invalidates both sessions and
every stored token with no migration path (`v:1` envelope, no key id) — silent
mass-disconnect on the next secret rotation.

**Where (verified 2026-09-16):**
`src/server/github/github-tokens.ts:20-38` (`deriveKey`), `:42,60` (use), `:147-156` (decrypt-failure),
`src/auth.ts:44,57`, `docs/vercel.md:103` (rotation note), `.env.example:21-25`

**Current state:**
AES-256-GCM at rest, decrypt-failure pages operator + forces reconnect. Correct
single-key behavior; the risk is rotation, not day-to-day use. (Already noted as
TODO-08 in the prior quality audit — repeated here because it blocks safe
secret rotation in production.)

**Missing / Problem (verified 2026-09-16):**
No `GITHUB_TOKEN_ENCRYPTION_KEY` (zero hits in `src/`), no `kid` envelope
(still `{ v: 1, iv, tag, ciphertext }`), no decrypt-with-old /
encrypt-with-new path; no rotation runbook. Worse, `docs/vercel.md:103` claims
rotation "also re-encrypts stored tokens" — no re-encrypt code exists anywhere
(the string appears only on that line), so the note asserts behavior the code
cannot perform; the only honest rotation doc is the decrypt-failure comment at
`github-tokens.ts:147-156` (report + force-reconnect).

**Required change:**
Pick one: (a) introduce dedicated key with fallback + startup warning and key-id
  envelope, or (b) replace the false "re-encrypts" note in `docs/vercel.md:103`
with an honest statement that rotating `AUTH_SECRET` invalidates sessions AND
stored tokens (reconnect required) + startup log when fallback is in use.
Prefer (a) if a migration is acceptable. Either way the "re-encrypts"
parenthetical must go — it describes code that does not exist.

**Completion impact:** Medium

**Complexity:** Small (b) / Medium (a)

**Evidence (verified 2026-09-16):**

- `github-tokens.ts:20-38,147-156`; `auth.ts:44,57` (same var as NextAuth secret);
  `docs/vercel.md:103` (inaccurate rotation note); `.env.example:21-25` (no key var);
  zero hits for `GITHUB_TOKEN_ENCRYPTION_KEY|kid` in `src/`.

---

### [ ] TODO-13: Decide and document project-history retention on disconnect/delete; `github_tokens` outlive org delete

**Why:**
Disconnect cascades scoped rows so only the disconnect evidence row survives —
per-project finding history is gone, while org-delete explicitly promises
"evidence retained". The asymmetry is undocumented, and per-user `github_tokens`
(no FK/cascade) survive org/project delete by design without a note. Operators
and users can't reason about what "delete" keeps.

**Where (verified 2026-09-16):**
`src/server/workspace/connect-github.ts:201-246`,
`src/server/workspace/orgs.ts:134-156`,
`packages/db/src/schema.ts:75,110,132,275-289`, `src/server/actions/org.ts:265-287`

**Current state (verified 2026-09-16):**
Disconnect returns `{deleteProjectId, evidence, nextProjectId}` (`connect-github.ts:201-246`,
"scoped rows drop via the project FK cascade" at `:202`) — only the
`project_disconnected` evidence row survives. Org delete (`orgs.ts:134-156`,
`actions/org.ts:265-287`) promises "Evidence history was retained for audit."
(`org.ts:286`) — but only in a toast, not in docs. Cascades correct via FK;
evidence FK-less + retained by design. Token clearing on sign-out works.

**Missing / Problem:**
No documented retention rule for disconnect (history loss surprises returning
clients); no note that per-user tokens (FK-less, `schema.ts:275-289`) remain
usable for other orgs after one org is deleted.

**Required change:**
Document the retention matrix (disconnect vs project delete vs org delete ×
findings/remediations/evidence/tokens) in `docs/vercel.md` or the org UI;
confirm token survival is intended (likely yes — per-user scope) with one line.

**Completion impact:** Medium

**Complexity:** Small (docs + one confirmation test for cascade-keeps-evidence)

**Evidence (verified 2026-09-16):**

- `connect-github.ts:201-246` vs `org.ts:265-287`; `orgs.ts:134-156`;
  `schema.ts:75,110,132,275-289` (tokens FK-less).

---

### [ ] TODO-14: Harden URL/secret edges — `DATABASE_SSL_INSECURE` prod guard, `GITHUB_API_BASE_URL` scope, secret-redaction coverage

**Why:**
Small, sharp edges: the TLS-bypass flag works in prod despite "dev only" docs;
the GitHub API override can point at loopback by design (e2e mock) with no
per-request check; token-redaction doesn't name `gho_/ghu_/github_pat_` or PEM
blocks explicitly. Each is minor alone; together they're the MITM/secret-leak
surface.

**Where (verified 2026-09-16):**
`packages/db/src/postgres.ts:45-50,69-74,146`,
`src/server/env.ts:41-43`, `src/server/github/github.ts:14-21`,
`packages/analysis-core/src/runtime/url-safety.ts:90-104,123-153,164-179`,
`src/server/redact.ts:6-18`, `src/server/assessment/repo-checkout.ts:129-154`

**Current state:**
SSRF posture is otherwise strong: public-hostname + port allowlist + credential
reject, DNS resolve + rebind guard, 10-hop redirect cap, fixed-host clone URL,
token via child env, ref-injection guard, checkout quota. Sentry scrub present.
Chromium re-resolve residual is documented and accepted.

**Missing / Problem (verified 2026-09-16 — all three sub-points still open):**

1. `DATABASE_SSL_INSECURE` honored in prod (docs say dev-only, code allows it:
   `postgres.ts:45-50` enables on env value alone, no `NODE_ENV` check; only the
   TLS-failure hint at `:146` says "local/dev only").
2. `GITHUB_API_BASE_URL` → `127.0.0.1` possible outside e2e (`env.ts:41-43`
   returns any value, `github.ts:14-21` spreads it as Octokit `baseUrl` with no
   validation; per-request loopback protection exists only for runtime audit URLs).
3. `redactSecrets` generic patterns only (`redact.ts:6-18` — no `gho_/ghu_/github_pat_`
   or PEM shapes) and no unit test file exists.

**Required change:**

- Refuse or warn-loud `DATABASE_SSL_INSECURE` when `NODE_ENV=production`;
  scope/validate `GITHUB_API_BASE_URL` outside e2e; add redaction unit test for
  token + PEM shapes.

**Completion impact:** Medium

**Complexity:** Small

**Evidence (verified 2026-09-16):**

- `postgres.ts:45-50,69-74` (no `NODE_ENV` check); `.env.example:12-14` (docs say local/dev);
  `env.ts:41-43` + `github.ts:14-21` (unvalidated base URL) vs `url-safety.ts:90-153`
  (loopback protection only for runtime audit URLs); `redact.ts:6-18` (generic only, no test file).

---

### [ ] TODO-15: Docs-vs-reality fixes — incremental-scan wording, orphan banner

**Why:**
Two small lies that erode trust: "changed JSX only on re-assess" hides that runtime
is always full and non-JSX changes force full scans; the findings orphan banner
undercounts the `by_cause` tab. (Resolved 2026-09-16: 58-vs-75 check-count wording
— README now reads "58 custom AST checks + `eslint-plugin-jsx-a11y` … (75 distinct
check ids)"; export-cap-vs-table wording — `docs/vercel.md:158-166` now states
"that bounds downloads, not the table.")

**Where (verified 2026-09-16):**
`README.md:64`,
`src/server/assessment/assessment.ts:351-451,459-470,562-584`,
`src/app/(app)/findings/page.tsx:76-96,153-162,217-220`,
`src/server/workspace/project-view.ts:158-193`

**Current state:**
Authority/merge/status-derivation core is tested and correct — this is copy and
counting only.

**Missing / Problem (verified 2026-09-16 — sub-points 2 and 3 remain):**

1. "Incremental" = snapshot-diff in worker (`assessment.ts:351-421`: gitHead +
   `controlScopeKey` + file-hash `detectChanges`, `changedJsx` scoped re-scan,
   `forceFullScan` on deletions/cross-file checks), not webhook-file-list;
   runtime always full (`:459-470` over all routes); `scanMode/filesScanned`
   persisted on assessment/evidence (`:562-584`) but never surfaced in the
   pipeline UI (`assessment-job-status.tsx` shows status/stage/error only,
   `dashboard/page.tsx:92-97` shows only "{n} files").
2. Orphan banner (`findings/page.tsx:153-162`) counts only rendered slices
   (`:90-96`: `openSlice` always + resolved/dismissed only when that tab is
   active), while the `by_cause` tab (`:217-220`) renders the unfiltered
   `findings` array (clusters built pre-filter at `project-view.ts:159-168`).

**Required change:**
Docs-only (plus one-line banner filter fix): document snapshot-diff +
always-full-runtime semantics and surface `scanMode` in the pipeline UI; fix
the banner to count from the same set `by_cause` renders (or filter orphans
out of clusters).

**Completion impact:** Low (trust, not function)

**Complexity:** Small

**Evidence (verified 2026-09-16):**

- `assessment.ts:351-451,459-470,562-584`; `assessment-job-status.tsx` (no `scanMode`);
  `dashboard/page.tsx:92-97`; `findings/page.tsx:76-96` vs `:153-162` vs `:217-220`;
  `project-view.ts:158-193`.

---

## P3 — Low

### [ ] TODO-16: Prod-config consistency polish — `E2E_*` visibility, internal-route coverage

**Why:**
Leftovers that bite once: `E2E_*` leak guard only fires when harness code is hit
(staging with leaked vars silently uses fixtures; health doesn't refuse harness
mode); `POST /api/internal/jobs/run` auth/rate-limit paths, `ops:check`, and
the evidence-export route have no test pinning them. (Resolved 2026-09-16:
Sentry default — `src/sentry/init.ts:4-11` pins the traces-sample-rate default
with an unset-DSN warning, pinned by `src/sentry/init.test.ts:9-43`.)

**Where (verified 2026-09-16):**
`src/server/e2e-harness.ts:24-36`,
`src/app/api/internal/jobs/run/route.ts:68-104` (+ `route.test.ts:46-69`),
`src/app/api/health/route.ts:1-46`,
`src/app/(app)/evidence/export/route.ts` (no test file),
`packages/db/src/repo/evidence.test.ts:13-23`

**Current state:**
Prod harness refusal (`E2E_PROD_HARNESS`) + unit pin exist; health liveness +
queue depth correct; worker auth constant-time correct.

**Missing / Problem (verified 2026-09-16):**
Health has zero `E2E`/harness references (`health/route.ts:1-46`), so staging
with leaked vars silently uses fixtures while health stays green;
`internal/jobs/run/route.test.ts:46-69` covers only success + batch-crash
(the 503/401/429 paths at `route.ts:68-104` are mocked but never exercised);
no test file references `operations-check`/`ops:check` anywhere; the export
route (`evidence/export/route.ts`) has no route-level test — only the pure
function is pinned (`evidence.test.ts:13-23`, incl. the 12,001→5,000 boundary).

**Required change:**

- Health reports harness mode (or refuses);
  tests for internal-run 503/401/429 paths, `ops:check` fail cases,
  export route-level boundary (default 5000 + `truncated` flag).

**Completion impact:** Low

**Complexity:** Small

**Evidence (verified 2026-09-16):**

- `e2e-harness.ts:24-36` (guard fires only when harness code is hit);
  `internal/jobs/run/route.ts:68-104` vs `route.test.ts:46-69` (auth paths untested);
  zero test refs to `operations-check`; `evidence/export/route.ts` (no route test)
  vs `evidence.test.ts:13-23` (pure function pinned).

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

## What is missing (triaged 2026-09-16 — every item re-verified open unless struck)

- ~~Job lifecycle control (cancel/dedup/stuck recovery) — P0~~ — DONE (TODO-01).
- ~~Prod worker/ops/backup hardening — P0 (TODO-03; GH-Actions topology, needs scheduled `ops:check` + restore drill).~~ — DONE 2026-09-17 (scheduled `ops:check` + restore runbook live; drill date/owner pending).
- Disconnect/reconnect repair, invite lifecycle, rate-limit coverage, evidence
  size alerting, PR failure signals, site copy, session edges — P1.
- Settings-to-assessment gap, secret dual-use, retention docs, TLS-bypass guard,
  docs-vs-reality copy — P2 (TODO-15 sub-points 1 and 4 resolved 2026-09-16).
- Config-consistency polish + ops-path tests — P3 (TODO-16 Sentry-default bullet resolved 2026-09-16).

## Biggest blockers

1. ~~**Worker/ops blindness (TODO-03)** — dispatch + schedule failures pile up
   silently; `ops:check` can't gate anything.~~ — DONE 2026-09-17.
2. **No repair flow (TODO-04)** — every revoked App / renamed repo becomes a
   generic-error support ticket.
3. **Invite lifecycle (TODO-05)** — phantom invites + silent role overwrites at
   agency scale.

## Recommended implementation order

1. ~~TODO-03 (scheduled `ops:check` with fail cases + restore drill) — makes prod observable.~~ — DONE 2026-09-17 (drill date/owner pending).
2. TODO-04 + TODO-05 (repair banner + invite validation) — kills top support tickets.
3. TODO-06 + TODO-07 (rate limits + evidence alert) — abuse/growth safety.
4. TODO-08 + TODO-09 + TODO-10 (check-run on exception, site copy, session edges).
5. TODO-11 … TODO-16 in order (TODO-01/02 done/removed; TODO-15.1, TODO-15.4, TODO-16 Sentry done).

## Definition of Done

The project can be considered complete when:

- A user can enqueue, **cancel**, and recover from stuck assessments without
  waiting on lease expiry; double-submits never stack duplicate jobs.
- Dispatch/schedule failures surface via alerting, `ops:check` enforces all
  prod-required vars and fails on queue/evidence growth, and backup retention +
  restore drill are documented and tested once.
- Revoked App / deleted-renamed repo / expired token each produce a repair path,
  not a generic error.
- Invites validate the GitHub login, expire, and never silently change roles;
  members can leave within owner/last-member guards.
- All expensive mutations are rate-limited.
- Evidence size is monitored; retention rules are documented.
- Worker exceptions post a PR Check Run signal; site findings read as site
  findings; session lifetimes and OAuth config errors are explicit.
- Docs counts/terminology match code; `lint && typecheck && test && build` green.

```

🌱 graft tokens saved across this audit ≈ 31,000 (build refresh + ask packs vs full-file reads).
```

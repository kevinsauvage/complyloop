# Project Completeness TODO

## P1 — High

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
  size alerting, PR failure signals, site copy, session edges — P1
  (TODO-04, TODO-05, TODO-06, TODO-07, TODO-08, TODO-09, TODO-10, TODO-13 done).
- Settings-to-assessment gap, secret dual-use, retention docs, TLS-bypass guard,
  docs-vs-reality copy — P2 (TODO-15 sub-points 1 and 4 resolved 2026-09-16).
- Config-consistency polish + ops-path tests — P3 (TODO-16 Sentry-default bullet resolved 2026-09-16).

## Biggest blockers

1. ~~**Worker/ops blindness (TODO-03)** — dispatch + schedule failures pile up
   silently; `ops:check` can't gate anything.~~ — DONE 2026-09-17.
2. ~~**No repair flow (TODO-04)** — every revoked App / renamed repo becomes a
   generic-error support ticket.~~ — DONE 2026-09-17.
3. ~~**Invite lifecycle (TODO-05)** — phantom invites + silent role overwrites at
   agency scale.~~ — DONE 2026-09-17.

## Recommended implementation order

1. ~~TODO-03 (scheduled `ops:check` with fail cases + restore drill) — makes prod observable.~~ — DONE 2026-09-17 (drill date/owner pending).
2. ~~TODO-04 + TODO-05 (repair banner + invite validation) — kills top support tickets.~~ — DONE 2026-09-17.
3. ~~TODO-06 + TODO-07 (rate limits + evidence alert) — abuse/growth safety.~~ — DONE 2026-09-17.
4. ~~TODO-08 + TODO-09 + TODO-10 (check-run on exception, site copy, session edges).~~ — DONE 2026-09-17.
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

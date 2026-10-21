# TODO — full audit follow-ups

Source: full audit run via `docs/prompts/master.md` (2026-10-21). Findings were traced in code by read-only agents; re-verify before fixing. Ask first for `drizzle/`, `src/core/`, `packages/analysis-core/src/contract/`.

**Size:** `S` ≈ under 1h, one file · `M` ≈ half a day, a few files + tests · `L` ≈ 1+ day or needs design. Sizes are rough estimates, not measured.

## P0 — blocking

- [ ] **`S`** **Account takeover via login reuse** — `packages/db/src/repo/orgs.ts:239-266` (also `:60`, `:36`): `claimMembershipsForLogin` rebinds already-claimed rows. Claim only `user_id IS NULL`; same predicate in `isPersonalOrgProvisioned`; add test with a row claimed by another user. _Why:_ a new owner of a released GitHub login inherits the old owner's org and projects. Needs independent review (auth).

- [ ] **`S`** **`upsertFindings` stale columns** — `packages/db/src/repo/findings.ts:347-366`: add `kind`, `severity_rank`, `engine`, `detected_at` to `set` via `excluded.*`; add DB test. _Why:_ a downgraded finding keeps its old severity/kind in filters, ordering and portfolio counts.

- [ ] **`M`** **Runtime `pageFailures` discarded** — `src/server/assessment/assessment.ts:534-537`, `packages/analysis-core/src/runtime/scan.ts:475-641`: a failed route must not resolve findings or pass runtime-only requirements (`unable_to_verify`). _Why:_ one timed-out page can silently mark its findings fixed and requirements passed.

- [ ] **`M`** **Finding auto-`verified` without a fix** — `assessment.ts:182-312`, `merge-findings.ts:47-66`: skip auto-verify when the runtime has taken over the check id. _Why:_ a remediation can reach `verified` with no real fix, an unverified compliance claim.

- [ ] **`M`** **Verify ignores theme conditions** — `src/server/assessment/remediation-verify-worker.ts:144-147`: re-audit under the finding's original conditions or fail closed. _Why:_ dark-mode-only findings "verify" because the default theme is clean.

- [ ] **`M`** **Pool starvation** — `packages/db/src/postgres.ts:201` (`POOL_MAX=3`), `src/server/actions/remediation.ts:177,200,246`: move rate-limit and queue calls out of `withProjectTx` (or onto `ctx.tx`). _Why:_ three concurrent actions can each hold a connection waiting for a fourth and hang. Plausible, not reproduced.

- [ ] **`S`** **`isUniqueViolation` ignores `.cause`** — `src/server/assessment/assessment-jobs.ts:63`: one shared helper in `packages/db`, reuse in `orgs.ts:160`. _Why:_ drizzle wraps pg errors, so the job-claim race and duplicate idempotency keys throw instead of being handled.

- [ ] **`S`** **Read-only collaborator write access via App** — `src/server/actions/connect.ts:126`, `github-app.ts:113-180`: require `permissions.push`/`admin` at connect and before `commitFixBranch`. _Why:_ the installation token can open branches/PRs on repos the user can only read.

- [ ] **`M`** **Source files stored in evidence / sent to AI unredacted** — `src/server/assessment/ai-fix.ts:76,100-110,187-218`, `src/ai/patch.ts:124`: store bounded diff, `redactSecrets` before storing and before the gateway call. _Why:_ evidence is append-only, so a secret in a stored file can't be removed.

- [ ] **`M`** **Prompt injection hardening** — `src/ai/ai-call.ts:92`, `explainer.ts:57`, `remediation.ts:25`, `packages/analysis-core/src/fixes.ts:12`: wrap repo-derived fields as untrusted; reject `"`, `{`, `}`, backtick in `attributeValue`; hostile-output tests. _Why:_ only `patch.ts` treats repo content as untrusted; AI output reaches the UI and PR bodies.

- [ ] **`L`** **Chromium with prod secrets in env** — `packages/analysis-core/src/runtime/scan.ts:167,286`: minimal `env`, `chromiumSandbox`, ideally split browser step from DB/App-key job. _Why:_ a renderer exploit on a customer page could reach the prod DB and App key. Exploitability unverified.

- [ ] **`S`** **WCAG 2.1.4 `j`/`k` shortcuts** — `src/app/(app)/findings/_components/finding-queue-nav.tsx:57,61`: opt-out or modifier; ignore `[role=dialog]` and `event.repeat`. _Why:_ single-key shortcuts with no off switch fire inside open dialogs.

- [ ] **`M`** **5,000-row loads** — `dashboard-view.ts:91`, `requirements-view.ts:80`, `settings-view.ts:39`: load only what is shown (SQL `ORDER BY … LIMIT 6`, requirements only, unread alerts only). _Why:_ the dashboard loads up to 5,000 findings to show 6.

- [ ] **`S`** **`findingStatuses: []` semantics** — `packages/db/src/repo/remediations.ts:42`: return `[]` for an empty list; add test. _Why:_ `[]` means "none" for findings but "no filter" for remediations, so settings loads the full history.

## P1 — should fix

**Correctness**

- [ ] `S` `applyStillFailing` doesn't refresh the requirement (`remediation-verify-worker.ts:261-282`).
- [ ] `M` Redetected dismissed finding keeps old `detectedAt`; also refresh `kind`/`severity`/`confidence` (`assessment-findings.ts:302-330`).
- [ ] `S` Exception over a human pass leaves status `passed` (`requirements.ts:179-192`).
- [ ] `M` Portfolio/findings-list counts ignore preset scope (`packages/db/src/repo/portfolio.ts:75-95`, `findings-view.ts:203-217`).
- [ ] `M` GitHub token refresh: serialize per user, parse `bad_refresh_token` on HTTP 200 (`github-tokens.ts:219-228`, `access-token.ts:68-86`).
- [ ] `M` `connectGitHubRepo` clones inside tx + advisory lock (`connect-github.ts:147`).
- [ ] `S` CI `if: env.X != ''` reads same-step env, so Slack alerts likely never fire (`ops-check.yml:60,69`, `assessment-worker.yml:121`).
- [ ] `S` Evidence `ORDER BY at DESC` needs `id DESC` tiebreak (`packages/db/src/repo/evidence.ts:195,223,281`).
- [ ] `S` Single approve/mark-implemented must check `finding.status === "open"` (`remediation.ts:85-107`, `remediation-verify.ts`).
- [ ] `S` Bulk actions: `.max(100)` on `findingIds`, batch-load with `inArray` (`src/core/actions/validate.ts:38`; `src/core/` is ask-first).

**Security (low)**

- [ ] `S` Whitelist DTO + redact `error` in assessment-jobs poll route (`route.ts:44`, `assessment-jobs.ts:125,540`).
- [ ] `S` Require `sslmode` in production (`packages/db/src/postgres.ts:21-24`).
- [ ] `S` Redact `reportError` context; Sentry `beforeSend` (`observability.ts:62`, `sentry/init.ts`).
- [ ] `S` Reject `deleted`/all-zero `after` in webhook (`webhook.ts:141`).
- [ ] `S` Authorize before DNS lookup (`runtime-audit.ts:58`); owner check before export load (`org.ts:286`); 429 on export (`evidence/export/route.ts:16`).
- [ ] `S` Use `isE2EHarnessEnabled()` (`github-access.ts:39`); alerts mark-read permission (`alerts.ts:36`).
- [ ] `S` `github.ref_name` → `env:` in workflows (`assessment-worker.yml:126`, `ops-check.yml:73`).

**Accessibility**

- [ ] `S` `max-h` + `overflow-y-auto` on dialog, alert-dialog, sheet.
- [ ] `S` `<pre>` in `code-block.tsx` keyboard-scrollable (`tabIndex=0`, role, label).
- [ ] `S` Prune bulk `selected` after action; close dialog; move focus.
- [ ] `M` "Opens in a new tab" disclosure on `target=_blank` links (RGAA 13.2).
- [ ] `S` Drop `/60` on meaningful muted text (portfolio table/overview).
- [ ] `M` Label-in-name fixes; persistent live region + field-error association; unique repeated link names; unique `nav` names; heading levels.

**Performance**

- [ ] `M` Repo picker: cache, real `page` handling, filter before slice, parallel installations.
- [ ] `S` `Promise.all` in dashboard and finding-detail views; `listUnreadAlertsForProject`.
- [ ] `S` Timeout / `ref` on `git.clone` (`repo-checkout.ts:132`).

**Architecture & quality**

- [ ] `S` Break import cycle `assessment.ts` ↔ `assessment-pipeline.ts`.
- [ ] `L` Move job-queue SQL to `packages/db/src/repo/` (or document the exception).
- [ ] `S` Narrow bare `catch` in `assessment-jobs/route.ts:36`, `github/repos/route.ts:46`; `reportWarning` in `monitor.ts:65`.
- [ ] `M` Route GitHub calls through `github-connector.ts` or narrow its header.
- [ ] `M` Single auth-config module (4 duplicated gates, 2 copies of `assertProductionGitHubAuth`).
- [ ] `M` One `isOneOf` guard + `zeroCounts` helper (≈17 casts).
- [ ] `S` Env reads through `src/server/env.ts` (`webhook.ts:40`, `assessment-job-dispatch.ts:16-37`, `layout.tsx:24`, `sitemap.ts:4`).
- [ ] `S` Replace "violation" in UI copy/evidence summaries (≈12 sites).
- [ ] `S` Use href builders instead of hard-coded list URLs; share status order + exception reasons with the contract.
- [ ] `L` Split files >300 lines / functions >200 lines (start with `assessment.ts`, `scan.ts`, `FindingsPage`, `EvidencePage`).
- [ ] `S` Remove or justify `switchProjectAction`, `maskedFindingDetail`, `reportAppError`, `domLocationDetails`.

**Dependencies & tests**

- [ ] `S` Move `@typescript-eslint/parser` to `dependencies` in `packages/analysis-core`; exclude `playwright-test-teardown.ts` from build; fix `playwright` type import.
- [ ] `M` Tests: `remediation.ts` bulk foreign-project + non-open dismiss; `requirements.ts` exception expiry (and the hardcoded `2026-12-31`); `webhook-deliveries` + `rate-limit` DB tests (add to `test:db`); the 3 evidence download routes; `openProjectAction`.
- [ ] `S` Bump minor/patch deps (`npm audit fix` for vite only; **not** `--force`).

## P2 — docs & cleanup

- [ ] `S` `AGENTS.md:59` claims a bundle check in `verify:gate`; `scripts/verify-gate.sh` has none.
- [ ] `S` Fix stale references: `server-conventions.mdc` (`requireOnFindingProject`), `docs/prompts/architecture-boundaries.md:12` (`persistProjectRows`), `contract/assessment-jobs.ts:5-6` paths, `architecture.md:46` (`src/ai` imports).
- [ ] `S` Add `OPS_MAX_PIPELINE_TABLE_MB` to `.env.example`.
- [ ] `S` `knip.json`: drop `ignoreExportsUsedInFile` or de-export ~23 in-file-only exports; justify ignored CSS deps.
- [ ] `M` Use `testFinding` fixture in the 9+ test files with hand-written Finding literals.
- [ ] `S` Minor: `VISIBILITY_DELAY_MS` vs "200ms" comment, `global-error.tsx` theme, `ReasonNoteFields` redundant label, `noUncheckedIndexedAccess` casts.

## Needs a human decision

- [ ] Bind invites to GitHub numeric id (not recyclable login)?
- [ ] Is `deleteEvidenceForOrg` an accepted exception to append-only? Document in rules.
- [ ] Disconnect cascade-deletes exceptions/dismissals — acceptable?
- [ ] Keep barrels `core/filter-params.ts` / `core/display.ts` (amend `code-quality.mdc`) or remove (~40 imports)?
- [ ] Enable `noUncheckedIndexedAccess`?
- [ ] Reword "no `use client` above `@/server/*`" to exempt server actions?
- [ ] `j`/`k`: opt-out, modifier, or drop? `PathnameFocus` on first load?
- [ ] Cap 5,000-row loads now or measure first? Accept dynamic marketing pages (CSP nonce)?
- [ ] May `member` record exceptions / human passes?
- [ ] Resolved finding reappears → new Finding; intended vs "reopen with history intact"?
- [ ] `not_applicable` in `passRate` denominator?
- [ ] Extend patch gate beyond a11y re-scan? Split worker runner from runtime audit?
- [ ] Keep `diff` dep for one consumer? Move `tw-animate-css` to devDependencies?

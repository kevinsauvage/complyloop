# ComplyLoop — Global TODO

> Generated from an audit of the current repository (Sep 2026).
> Priority is based on impact, risk, effort, and architectural importance.
>
> Overall assessment: the codebase is unusually disciplined — architecture docs
> match the implementation in every area spot-checked, security guards (SSRF,
> webhook HMAC + idempotency, token encryption, tenant isolation, serial job
> claims) are real and tested, and coverage thresholds are high with documented
> exclusions. **No P0 issues were found.** The highest-leverage work is the
> pre-merge GitHub surface, already scoped in `docs/ai/github-integration-audit.md`
> (verified as not yet implemented) and condensed into actionable tasks below.

## P0 — Critical

None identified. Security, data integrity (append-only evidence, stale-write
guards, transactional apply with cancel rollback), and job reliability
(lease + heartbeat + partial unique index) were verified in code and hold up.

---

## P1 — High Priority

### [x] Rich Check Run lifecycle: queued → in_progress → completed with severity breakdown + details_url
**Why:** PRs today show a single completed Check titled "N open violation(s), M failed requirement(s)" with no progress state, no severity split, and no link into ComplyLoop (`src/server/github/github-checks.ts:71-103`). Developers can't distinguish "scanning" from "verdict" and must leave GitHub for any detail. This is the smallest trust upgrade and the surface every later PR feature renders into.
**Change:** Post `queued` on webhook/manual enqueue (fire-and-forget), `in_progress` on claim (`claimNextAssessmentJob` site), `completed` with severity breakdown, `external_id` = job id, `started_at/completed_at`, and `details_url` deep-linking the assessment/finding page. Keep crash runs (`postFailureCheckRunForJob`) worded as infra failure, never compliance verdict. Keep the existing warn-never-throw contract — a GitHub outage must not fail assessments. Handle fork pushes (Checks API returns empty `pull_requests`; post by SHA).
**Impact:** High (every PR)
**Effort:** M
**Files:** `src/server/github/github-checks.ts`, `src/server/github/github-connector.ts`, `src/server/assessment/assessment-jobs.ts`, `src/server/assessment/assessment-worker.ts`, tests in `github-checks.test.ts` + worker tests, `e2e/webhook-helpers.ts` MockGitHub fixtures.
**Done when:** Every PR check shows the full lifecycle; details_url lands on the right page; zero assessment failures caused by Checks API errors (assert warn-only in tests).

### [ ] Stable finding fingerprint + new-vs-resolved delta against the default-branch baseline
**Why:** There is no cross-run finding identity — dedupe is within-run only (`packages/analysis-core/src/merge-findings.ts`), findings carry raw `filePath:line` locations (`contract/location.ts`), and grep confirms no fingerprint exists. Absolute counts on a 3-line PR teach developers to ignore the check; SonarQube/Semgrep treat new-code-only reporting as the commodity bar. This is the single highest-leverage product change and the prerequisite for annotations, comments, and any gating.
**Change:** V1: pure fingerprint function in `packages/analysis-core` (`checkId + normalized filePath + anchor` — anchor on selector/structural hash, not raw line, to survive line shifts); persist it on findings (migration — ask-first per AGENTS.md: `drizzle/` + `contract/`); preview runs classify against the latest authoritative assessment (which *is* the baseline — no new baseline entity): `new | persisted | resolved`; Check summary shows `+N new · −M resolved · net Δ · no new critical`. Treat renames as new+resolved pair with an explicit note. Previews still persist nothing (existing invariant + test must stay green).
**Impact:** Very high
**Effort:** M→L (migration + precision care)
**Files:** `packages/analysis-core/src/contract/` + new fingerprint module, `packages/db/src/schema.ts` + `drizzle/` migration + `repo/findings.ts`, `src/server/assessment/assessment-pipeline.ts` / `assessment.ts` (preview-vs-baseline diff step), `github-checks.ts` (delta renderer).
**Done when:** PR check reports delta counts on a labeled PR corpus with ≥95% new/resolved precision on deterministic source findings (pre-commit this bar before any gating work); invariant test "preview persists nothing" still passes.

### [ ] Ground the delta in the PR: capped Check annotations + one upserted summary comment
**Why:** Counts and deltas still require opening the Checks tab and leaving the diff. Annotations put deterministic findings at file:line in Files-changed with zero notification noise; a single marker-keyed comment catches developers who never open Checks. Both use permissions already granted (Checks W, PR W) and share the delta renderer from the fingerprint task — implement together.
**Change:** (a) Annotate only **new deterministic source findings on changed lines** (changed-line set from `GET /pulls/{n}/files` or compare API), cap ~10–20 with overflow summarized, batch ≤50/request, `warning` for violations / `notice` for warnings, `raw_details` = requirement + fix hint + ComplyLoop link. Never annotate pre-existing debt, heuristic-only, or runtime-only findings. (b) One `<!-- complyloop:summary -->` issue comment per PR: create on first preview completion, find-by-marker + `PATCH` on later pushes, never a second comment, skip silently without an installation token. Route all quoted source snippets through the existing redaction (`redactSecrets`/`redactCloneUrl` discipline).
**Impact:** High
**Effort:** M
**Files:** `src/server/github/github-checks.ts` (annotation builder), new `src/server/github/github-pr-comment.ts`, `src/server/assessment/assessment-worker.ts` (preview path hook), tests + e2e MockGitHub extensions.
**Done when:** e2e asserts ≤1 ComplyLoop comment per PR across two pushes (edit path exercised); annotations appear only on new deterministic changed-line findings and respect the cap.

---

## P2 — Medium Priority

### [x] `check_run.rerequested` → re-enqueue (self-serve Re-run)
**Why:** A stale/red check currently has no retry path, generating "push an empty commit" behavior and support load. The event is auto-delivered with Checks W already granted.
**Change:** Handle `check_run` webhook with `action: rerequested` for our check name only: re-verify installation binding (`payload.installation.id === project.installationId`), rate-limit via the existing `webhook:<projectId>` bucket (re-request is a free job trigger otherwise), enqueue a preview job for that SHA with delivery-id idempotency. Ignore other apps' runs.
**Impact:** Medium
**Effort:** S
**Files:** `src/server/github/webhook.ts` (`parseHandledWebhookEvent` + handler), `src/app/api/github/webhook/route.ts` (already generic), tests mirroring push/PR paths.
**Done when:** e2e: rerequest delivery → queued job → fresh Check; other-app runs and unbound installations rejected.

### [x] Make the AI model configurable instead of hardcoding a free-tier model
**Why:** `src/ai/ai-call.ts:30` pins `AI_MODEL = "poolside/laguna-s-2.1-free"` for every explain/remediate/patch call. A free model id will rotate, rate-limit, or produce weak patches in production, and there is no way to upgrade without a code change. AI is advisory-only, so blast radius is contained — but output quality is user-visible.
**Change:** Read the model from `src/server/env.ts` (lazy getter, e.g. `AI_MODEL` env) with the current value as default; keep `src/ai` free of `@/server` imports by injecting the model string or reading `process.env` directly (existing precedent in `aiAvailable()`); document in `.env.example` + README.
**Impact:** Medium
**Effort:** S
**Files:** `src/ai/ai-call.ts`, `src/ai/patch.ts`, `src/ai/remediation.ts`, `src/server/env.ts`, `.env.example`, tests.
**Done when:** Model id overridable via env; default unchanged; all `src/ai` tests pass without `@/server` imports.

### [ ] Policy-gated check conclusions (narrow, opt-in failure set)
**Why:** A check that fails on heuristic noise gets disabled; one that never fails gets ignored. The conclusion should encode ComplyLoop's deterministic-authority principle: `failure` only for new deterministic high-confidence source findings on changed lines; `neutral` with explicit "advisory, not a verdict" wording when only heuristic/`unable_to_verify`/runtime-absent signals exist.
**Change:** Pure, tested policy module (`src/core/` — must not import `finding-act.ts` per architecture rules); per-project threshold config (settings migration, ask-first); worker conclusion site; ship advisory-neutral default with explicit opt-in to failure. Branch-protection/Ruleset wiring is documentation only, no code.
**Impact:** High (trust) but gated on delta precision data
**Effort:** M
**Files:** new `src/core/assessment/check-conclusion.ts` (or similar), `src/server/assessment/assessment-worker.ts`, `github-checks.ts`, settings schema + UI.
**Done when:** Conclusion classes are covered by unit tests; default is neutral-advisory; failure requires opt-in and fires only on the narrow deterministic set. Do not start before the fingerprint delta has precision data.

### [ ] Scoped PR scan fast path (verdict stays full-scan until parity is proven)
**Why:** Full clone+scan per `synchronize` makes PR feedback slow; fast feedback is the difference between fixed-in-PR and fixed-never. The building blocks already exist: `detectChanges` hashing vs `assessment_snapshots.fileHashes` (`monitor.ts`), `scanChangedFiles`, `scopedFileSet` resolve semantics, and the `hasCrossFileChecks → full scan` guard.
**Change:** Derive the scope set from PR files/compare API; run `scanChangedFiles` for the annotation/summary pass; keep the full preview scan as the verdict source; surface `scanMode` honestly in Check text ("scoped preview — full verdict follows"). Instrument via existing stage timings and measure P50/P95 before/after plus scoped-vs-full agreement rate.
**Impact:** Medium-High (speed)
**Effort:** M
**Files:** `src/server/assessment/assessment.ts` (scoped path exists), worker preview orchestration, `github-checks.ts`.
**Done when:** Preview latency measurably down; agreement rate reported; verdict semantics unchanged (no persisted state from previews).

### [ ] Repository intelligence at connect time (framework/tooling/CODEOWNERS detection)
**Why:** Assessment config is fully manual and ComplyLoop can't answer "do you already run axe in CI?" or "who owns this file?". All needed reads (contents API for `package.json`, workflow file presence, `CODEOWNERS`) work under current permissions with no clone.
**Change:** Read-only crawl at connect + drift refresh: framework/dep signals, a11y tooling presence, CODEOWNERS parse (mirror GitHub semantics: root/.github/docs locations, last-match-wins, ≤3MB, skip invalid lines). Surface as connect-panel suggestions (preset, runtime-URL hint) and owner names in Check/PR summaries. Display only — no auto-assign, no review requests. Cap path enumeration and cache for monorepos.
**Impact:** Medium
**Effort:** M
**Files:** new `src/server/github/repo-intel.ts`, `src/server/actions/connect.ts`, connect-panel components, small project-metadata columns (migration, ask-first).
**Done when:** Detection accuracy validated on a repo sample; connect flow shows suggestions; zero new permissions granted.

---

## P3 — Nice to Have

### [x] Doc hygiene: fix stale references in `docs/ai/github-integration-audit.md`
**Why:** Line 51 cites `POST /api/internal/jobs/run` (`route.ts:67-140`, `maxDuration=300`) as a degraded fallback — that route no longer exists (`src/app/api/` has only auth, github, health, projects). Small, but the doc is the roadmap source for the P1/P2 tasks above and should not mislead the implementing agent.
**Change:** Remove/correct the stale route reference; after each GH task ships, tick it off in the doc's §11 or prune the section in favor of this TODO.
**Impact:** Low
**Effort:** S
**Files:** `docs/ai/github-integration-audit.md`.
**Done when:** Every file:line citation in the doc resolves against the current tree.

### [ ] Narrow inline review comments (conditional — only if annotation data justifies)
**Why:** If data shows annotated criticals are still missed, review comments are the louder signal — but they persist and notify, so they must stay rare.
**Change:** Only new critical deterministic source findings, cap ~3/PR, update-in-place (PATCH by fingerprint-keyed lookup, DELETE/outdate when resolved), behind a project flag defaulting **off**. Watch secondary rate limits.
**Impact:** Medium (conditional)
**Effort:** M
**Files:** new `src/server/github/github-review-comments.ts`, fingerprint→comment-id map (table, ask-first migration).
**Done when:** Shipped only after annotation CTR/acknowledgement data shows criticals are missed; e2e proves update-in-place and no pre-existing-debt comments.

### [ ] Reduce the "add a check id" touch-point count
**Why:** Adding a check requires editing `CHECK_IDS` → `checks/registry.ts` (or jsx-a11y map) → `check-authority.ts` → runtime map → catalog `checkId` → `guidance.ts` + 2 tests (documented in `packages/analysis-core/AGENTS.md`). The coverage tests catch omissions, so this is friction, not risk — worth consolidating only if check authorship accelerates.
**Change:** Consolidate per-check metadata (authority class, engine mapping, guidance ref) into one declaration per check with derived lists, keeping `check-authority.test.ts` + `catalog-coverage.test.ts` as the safety net. Do **not** rename/split `checks/heuristic-utils.ts` (~14 dependents; AGENTS.md requires a design task).
**Impact:** Low-Medium (maintainability)
**Effort:** M
**Files:** `packages/analysis-core/src/check-registry.ts`, `check-authority.ts`, `checks/registry.ts`, `catalog/`.
**Done when:** A new check id can be added by touching ≤3 files and all existing authority/coverage tests still pass unchanged.

---

## Deferred / Not Worth Doing

Recorded so these stay decided (rationale in `docs/ai/github-integration-audit.md` §9-Avoid; re-verified against current code):

- **Per-finding GitHub Issues sync with auto-close** — duplicates the finding lifecycle in a weaker system; two sources of truth; auto-close races. Needs a new Issues W permission for narrow value.
- **SARIF upload to code scanning** — wrong surface for RGAA evidence; costs `security-events: write` for visibility ComplyLoop already owns in Checks + dashboard.
- **Consuming external CI results as evidence** — provenance can't meet the deterministic-evidence bar. Presence-detection (repo intelligence task) suffices.
- **A ComplyLoop GitHub Action (second execution model)** — reintroduces fork-PR secret handling and duplicate-run prevention; only justified if a validated segment can't install the App.
- **Per-commit / feature-branch push scans** — multiplies jobs against a serial-per-project queue with no verdict value; current "ignore non-default pushes" (`webhook.ts:154-163`) is correct.
- **Merge-blocking on heuristic / AI / `unable_to_verify` signals** — unsound; trains teams to bypass the check. Gating is only defensible via the narrow policy-conclusion task (P2), and only after delta precision data.
- **Explicit pinned baselines (per-release/per-branch)** — the latest authoritative assessment already *is* the baseline; revisit only for monorepo/release-branch demand.
- **Removing the `@sparticuz/chromium` serverless browser path** (`runtime/scan.ts:157-208`) — looks vestigial next to the GH Actions worker, but is still load-bearing for on-demand runtime verification (`remediation-verify.ts` → `scanRuntime`) running inside Vercel serverless functions. Keep.
- **Replacing the slice→callback→payload write model with direct repo calls** — the abstraction carries locking, stale-write guards (`repo/upsert-guard.ts`), and evidence-append invariants; it earns its cost.
- **Splitting/renaming `checks/heuristic-utils.ts`** — 14 dependents, explicitly protected by package AGENTS.md pending a design task.
- **Coverage-threshold chasing on the excluded e2e/test:db surfaces** — exclusions in `vitest.config.mts` are individually justified (browser/Postgres/network dependencies) and covered by `test:e2e`/`test:db`.

## Audit Notes

- **Security verified strong, not assumed:** SSRF policy (`packages/analysis-core/src/runtime/url-safety.ts`) checks hostname+resolved IPs at save *and* per navigation/redirect hop, with a DNS-rebinding double-resolve guard, port allowlist, redirect-hop cap, and per-scan DNS memoization. Webhook route: HMAC via `@octokit/webhooks-methods` (timing-safe), delivery-claim idempotency with 503-for-retry on claim failure, 5MB body cap, installation-id cross-check, nodejs runtime. OAuth tokens AES-256-GCM at rest (`github-tokens.ts`), installation tokens ephemeral and never stored, installation ids never trusted from the client (anti-spoof via user's own installation list).
- **Job pipeline verified:** 30-min lease + 5-min heartbeat with cancel detection (`assessment-worker.ts:83-113`), mid-apply cancel rolls back the transaction (`assessment-worker.ts:160-165`), serial-per-project enforced by DB partial unique index (not just `SKIP LOCKED`), corrupt payloads terminal-fail at claim, stage timings reported for forensics. Docs in `architecture.md` match the code in every checked claim.
- **Domain model is coherent:** Requirement → Assessment → Finding → Remediation → Verification → Evidence → Monitoring is consistently implemented; `verified` only via deterministic re-check; AI (`src/ai/`) structurally cannot set statuses (contract-only imports, injected `onError`, ESLint-enforced boundaries); PR-head scans are previews that persist nothing; status derivation order lives in one place (`contract/requirement-status.ts`).
- **Testing is behavior-focused:** unit thresholds 94/96/80/90 with individually justified exclusions; concurrency suites exist (`assessment-jobs.concurrency.test.ts`, `orgs-concurrency.test.ts`); evidence append-only enforced by trigger + test; e2e covers webhook, authz, core loop, compliance loops. No critical unprotected flow identified beyond the browser/DB-excluded surfaces that e2e covers.
- **Frontend discipline holds:** server/client boundary matches the AGENTS.md convention (async data-fetching components without `"use client"`; interactivity in dedicated leaves like `mobile-nav-sheet`, `pathname-focus`); dashboard polling has visibility-change handling; `ui/` primitive count (17) is consistent with the 2+-consumers policy at a glance.
- **Assumption:** the "Now" list in `docs/ai/github-integration-audit.md` was written Sep 2026 against this tree and none of GH-1..GH-5 is implemented (verified: `github-checks.ts` posts completed-only count checks; no fingerprint, annotations, comments, or rerequest handling exist). Tasks above condense that plan; consult the doc for per-item risk/validation detail.
- **Ask-first boundaries apply** to several tasks above (migrations in `drizzle/`, `contract/` changes, `src/core/` kernel) per AGENTS.md — plan and get approval before editing.

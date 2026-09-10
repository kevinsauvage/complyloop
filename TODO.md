# TODO — Implementation Roadmap

Generated from a Graft-backed audit of the whole project. Each item is written for an AI coding agent to execute. Priorities are P0 (critical) → P3 (cleanup).

---

## Legend

- **Problem:** what is wrong and why it matters.
- **Evidence:** exact file/function or file:line spans.
- **Action:** the concrete change to make.
- **Verification:** how to confirm the fix.

---

## P0 — Critical correctness

### P0-1 Targeted project writes refresh requirement status with partial findings

- **Problem:** `loadTargetedProjectRuntime` only loads the `findingIds` passed in the write scope. When `dismissFindingAction`, `bulkDismissFindingsAction`, or `verifyRemediationAction` later calls `applyRequirementStatusRefresh`, the working `rows.findings` does not contain the control’s other open findings. After the touched finding is dismissed/resolved, the refresh counts zero open findings for the control and incorrectly flips the requirement to `passed`.
- **Evidence:**
  - `packages/db/src/workspace-load.ts:149-238` (`loadTargetedProjectRuntime` loads findings only by ID).
  - `src/server/actions/remediation.ts:180-220` (`dismissFindingAction` calls `applyRequirementStatusRefresh` after cloning `db.findings`).
  - `src/server/actions/remediation.ts:222-276` (`bulkDismissFindingsAction`).
  - `src/server/actions/remediation-verify.ts:121-199` (`verifyRemediationAction`).
  - `src/server/assessment-status.ts:335-356` (`applyRequirementStatusRefresh` derives open-finding counts from `rows.findings`).
- **Action:** In `loadTargetedProjectRuntime`, when `controlIds` is derived from the touched findings, also load **all open findings for those control IDs** into the working slice. Alternatively, widen `withFindingWrite` and `withProjectWrite({ touch: "entities" })` to automatically include every finding sharing a touched `controlId`. Ensure remediations are loaded for the widened finding set.
- **Verification:** Add an integration test with two open findings under the same control; dismiss or verify one and assert the requirement remains `failed` (or becomes `passed` only when the last finding is resolved). Run `npm run test -- src/server/actions/remediation.test.ts src/server/actions/remediation-verify.test.ts` and the full suite.

---

## P1 — High-impact correctness / security / reliability

### P1-1 `clearRequirementOverride` recomputes status with zero findings loaded

- **Problem:** `clearRequirementHumanPassAction` and `clearRequirementExceptionAction` use `withProjectWrite({ touch: "entities", requirementIds: [id] })` with no `findingIds`. The loaded `db.findings` is empty, so after the human determination is cleared, `applyRequirementStatusRefresh` sees no open findings and may set a standard control to `passed` even though real open findings still exist in the database.
- **Evidence:**
  - `src/server/actions/requirements.ts:75-131` (`clearRequirementOverride` clones `db.findings`).
  - `src/server/actions/requirements.ts:301-324` (`clearRequirementOverrideAction` passes only `requirementIds`).
- **Action:** Load all open finding IDs for the requirement’s `controlId` when clearing an override (include them in the write scope or load them inside the action before refreshing), so the status re-derivation is based on the full finding set.
- **Verification:** Integration test: create an open finding, mark its requirement `not_applicable`, clear the exception, and assert the requirement returns to `failed`.

### P1-2 `verifyRemediationAction` checks remediation status outside the write lock

- **Problem:** The action validates `previewRemediation.status !== "implemented"` before acquiring the project lock. Inside `withFindingWrite`, `markVerified` calls `advanceRemediation(remediation, "verified")` without re-checking the current status. If a concurrent write already advanced the remediation to `verified`, `advanceRemediation` throws a raw `Error` instead of a user-facing `PublicError`.
- **Evidence:**
  - `src/server/actions/remediation-verify.ts:130-136` (pre-lock status check).
  - `src/server/actions/remediation-verify.ts:72-119` (`markVerified` calls `advanceRemediation` unconditionally).
- **Action:** Inside `markVerified`, assert `remediation.status === "implemented"` and throw a `PublicError` if not, before calling `advanceRemediation`.
- **Verification:** Unit test where the loaded remediation is already `verified` returns a `PublicError` with a clear message.

### P1-3 SSRF DNS-rebinding TOCTOU in runtime audit

- **Problem:** `assertSafeRuntimeUrl` resolves hostnames via Node/OS DNS, but Chromium performs its own resolution at navigation time. A malicious preview domain can return a public IP during the safety check and a private/metadata IP when the browser actually connects, bypassing the SSRF gate.
- **Evidence:**
  - `packages/analysis-core/src/runtime/url-safety.ts:82-112` (`assertSafeRuntimeUrl` uses `dns.lookup`).
  - `packages/analysis-core/src/runtime/scan.ts:164-209` (per-hop checks rely on the same resolver).
- **Action:** Force fresh, non-cached DNS resolution before every browser connection and compare the result to the pre-navigation safety check, or document and enforce that Playwright runs in a network sandbox that cannot reach RFC 1918/169.254 addresses. At minimum, add a deterministic second DNS lookup immediately before `gotoForRuntimeAudit` and reject mismatches.
- **Verification:** Add a test with a mock `DnsLookup` that returns `93.184.216.34` on the first call and `10.0.0.5` on the second; assert the second lookup blocks navigation.

### P1-4 Advisory-lock deadlock in `withProjectWrite`

- **Problem:** `withProjectWrite` acquires the project lock from the cookie, loads the workspace, and then—if the resolved project differs—acquires a second lock without releasing the first. Two writers with swapped/stale active-project cookies can acquire each other’s first lock and deadlock.
- **Evidence:** `src/server/workspace-write.ts:176-194`.
- **Action:** Resolve the effective project ID before acquiring any lock, or acquire multiple locks in a deterministic sorted order and release the first lock before re-acquiring. The simplest fix is to load workspace/project resolution first (without a project lock), then acquire exactly one lock for the resolved project.
- **Verification:** Concurrent test where session A’s cookie points to P1 (but resolves to P2) and session B’s cookie points to P2 (but resolves to P1); expect one transaction to fail with a deadlock/timeout error rather than both hanging.

### P1-5 GitHub OAuth token silently dropped when `AUTH_SECRET` is missing

- **Problem:** `storeUserGitHubToken` returns silently when `AUTH_SECRET` is unset. Sign-in can succeed, but the OAuth token is never persisted, so later GitHub API/clone operations fail with a missing-token error that is hard to diagnose.
- **Evidence:** `src/server/github-tokens.ts:74-77`.
- **Action:** Fail loudly at startup or inside the JWT/account callback when GitHub auth is configured but `AUTH_SECRET` is missing, so the missing secret is caught during deployment rather than at first clone.
- **Verification:** Test sign-in with `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET` set and `AUTH_SECRET` unset; assert an explicit configuration error is thrown and no token row is written.

---

## P2 — Worthwhile improvements

### P2-1 `markRemediationImplementedAction` advances remediation without status guard

- **Problem:** It calls `advanceRemediation(remediation, "implemented")` directly. If the remediation is already `implemented` or `verified`, `canTransition` returns false and the action throws a raw internal error.
- **Evidence:** `src/server/actions/remediation-verify.ts:205-241`.
- **Action:** Guard with a `PublicError` when `remediation.status` is not `approved` (or `suggested`).
- **Verification:** Unit test with a `verified` remediation returns a `PublicError`.

### P2-2 Missing input length limits in runtime audit action

- **Problem:** `updateRuntimeAuditInput` accepts arbitrary-length strings. A very large `runtimeBaseUrl` or `runtimeRoutes` value consumes memory and CPU before `assertSafeRuntimeUrl` rejects it.
- **Evidence:** `src/server/actions/runtime-audit.ts:34-37`.
- **Action:** Add `.max(2048)` to `runtimeBaseUrl` and `.max(4000)` to `runtimeRoutes`.
- **Verification:** Submit a FormData with a multi-megabyte base URL; expect validation to reject it before any DNS lookup.

### P2-3 Internal worker trigger route has no rate limiting

- **Problem:** `/api/internal/jobs/run` only validates `WORKER_SECRET`. If the secret is leaked or brute-forced, an attacker can fire unlimited batch requests.
- **Evidence:** `src/app/api/internal/jobs/run/route.ts:31-40`.
- **Action:** Add `assertRateLimit` keyed by a hash of the bearer token (or source IP) before running the batch.
- **Verification:** Repeated requests with a valid `WORKER_SECRET` return `429 Too Many Requests` after the limit.

### P2-4 Generic error handler may log secrets

- **Problem:** `publicErrorMessage`/`reportError` capture the full `message` and `stack` of unexpected errors. If a third-party library or runtime error includes an `Authorization` header, database URL, or token, it is emitted without redaction.
- **Evidence:**
  - `src/server/action-state.ts:29-33`.
  - `src/server/observability.ts:116-135`.
- **Action:** Sanitize common secret patterns (URLs with credentials, `Authorization`/`Bearer`/`Basic` values, `DATABASE_URL` passwords) before logging or sending to Sentry.
- **Verification:** Unit test that throws an error containing a fake token and DB URL; assert the reported output contains neither.

### P2-5 HTML audit report drops `sourceKind` when `sourceRef` is present

- **Problem:** `reportShell` computes `const source = header.sourceRef ?? header.sourceKind;`, so a project with `sourceKind: "github"` and `sourceRef: "main"` renders only `"main"`. The markdown report preserves both.
- **Evidence:**
  - `src/server/report-html/primitives.ts:421`.
  - Contrast `src/server/report-markdown.ts:52`.
- **Action:** Render both fields, e.g. `Source: ${sourceKind}${sourceRef ? ` — ${sourceRef}` : ""}`.
- **Verification:** Snapshot test for the HTML audit report with `sourceKind: "github"` and `sourceRef: "main"` contains both values.

### P2-6 Synchronous checkout-quota walk blocks the event loop

- **Problem:** `assertCheckoutWithinQuota` recursively walks the checkout with `fs.readdirSync`/`fs.statSync`. Large repositories near the file quota can block the Node event loop for seconds.
- **Evidence:** `src/server/repo-checkout.ts:35-62`.
- **Action:** Rewrite the walk with `fs.promises.opendir`/`fs.promises.stat` and enforce a time budget.
- **Verification:** Create a directory with ~50k small files and measure event-loop lag during the quota check.

---

## P3 — Minor cleanup / duplication

### P3-1 Dead exports in `check-authority.ts`

- **Problem:** `isSiteLevelCheck` and `keepOpenWhenRuntimeScanSkipped` are exported but only used in tests/comments.
- **Evidence:** `packages/analysis-core/src/check-authority.ts:30-31`, `:62-64`.
- **Action:** Remove the exports; inline any registry lookups the tests need.
- **Verification:** `npm run typecheck && npm run test -- packages/analysis-core/src/check-authority.test.ts`.

### P3-2 Dead export `styleHasBackgroundImage`

- **Problem:** Exported helper is only exercised by its own unit tests; no check consumes it.
- **Evidence:** `packages/analysis-core/src/checks/heuristic-utils.ts:161-172`.
- **Action:** Delete `styleHasBackgroundImage` and its tests.
- **Verification:** `npm run typecheck && npm run test -- packages/analysis-core/src/checks/heuristic-utils.test.ts`.

### P3-3 Single-item DB upsert wrappers add API surface for one caller

- **Problem:** `upsertFinding` and `upsertRemediation` are thin wrappers used only by the e2e seed script.
- **Evidence:**
  - `packages/db/src/repo/findings.ts:74-80`.
  - `packages/db/src/repo/remediations.ts:78-84`.
  - `scripts/e2e-seed.ts:123` and `:154`.
- **Action:** Delete both wrappers and update `e2e-seed.ts` to call `upsertFindings(tx, [{ ... }])` / `upsertRemediations(tx, [{ ... }])`.
- **Verification:** `npm run typecheck && npm run test:e2e` (or run `scripts/e2e-seed.ts` locally).

### P3-4 Report-model thin wrappers around `countByStatus`

- **Problem:** `countRequirementsByStatus` and `countFindingsByStatus` are one-line wrappers that add indirection.
- **Evidence:** `src/server/report-model.ts:43-53`.
- **Action:** Inline them inside `composeAuditReport`.
- **Verification:** `npm run typecheck && npm run test -- src/server/report-model.test.ts`.

---

## Completed — P0/P1 correctness pass

The items from `docs/superpowers/specs/2026-09-08-p0-p1-correctness-design.md` are already implemented and verified:

- **P0-1** SSRF per-URL guard + absolute-route rejection (`packages/analysis-core/src/runtime/scan.ts:324-335`, `src/server/actions/runtime-audit.ts:23-32`).
- **P0-2** In-memory `OrgMembershipIndex` (`src/server/org-queries.ts`, `src/server/orgs.ts`, `src/server/org-membership.ts`).
- **P1-1** Error-prevention dataset keys (`packages/analysis-core/src/runtime/custom-checks/error-prevention.ts:68`).
- **P1-2** Atomic rate-limit increment (`src/server/rate-limit.ts:54-65`).
- **P1-3** Webhook PR `head.sha` validation (`src/server/webhook.ts:106-115`).
- **P1-4** Low-confidence heuristic audit (dropped checks no longer present in registry).
- **P1-5** Shared `AutoSubmitSelectForm` (`src/components/auto-submit-select-form.tsx`, used by org/project switchers).
- **P1-6** Unified status counting (`src/core/lifecycle.ts:141-154`, used by dashboard/requirements pages).

Definition of done for any new work: `npm run lint && npm run typecheck && npm run test && npm run build`.

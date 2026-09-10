# BUG-TODO — Real bugs / logic errors

Re-checked **2026-09-10 ~21:45** (Europe/Madrid) against working tree on `refactor/remove-duplication`.  
Trust code over docs. This file only — no application fixes in the audit pass.

Priorities: **P0** critical/breaking · **P1** important functional · **P2** normal · **P3** minor/edge.

**Open:** P0: 0 · P1: 0 · P2: 0 · P3: 0

---

## Open

(none)

---

## Fixed in this pass

### 1. Draft PR create-then-write: retry claim is false; `prUrl` cleared on error — FIXED
- **Priority:** P2 (was P3 — upgraded)
- **Problem:** `createPullRequestAction` still runs `preparePullRequest` (push + GitHub `pulls.create`) **before** `withFindingWrite`. On write failure the catch message tells the user to retry and that “the existing branch and PR will be reused,” but that is not true in production: each call uses a **fresh shallow clone** of the default branch (`withProjectCheckout` → `clone --depth 1`), so local branch reuse never sees the remote fix branch; a second push is typically non-fast-forward, and a second `pulls.create` fails if the PR already exists. Separately, the action always returns `prUrl: null` when `!state.ok`, so `CreatePrForm` never shows the “Open draft PR” link even though the URL is known in the catch path — only buried in the error string.
- **Evidence:**
  - `src/server/actions/pr.ts` → `createPullRequestAction` (~70–132): `preparePullRequest` then `try { withFindingWrite } catch { PublicError … Retry — … reused }`; final `return { …, prUrl: state.ok ? prUrl : null }`.
  - `src/server/repo-checkout.ts` → `withRepoCheckout` / `cloneAuthedShallow` (fresh temp dir + `--depth 1` every call).
  - `src/server/pr.ts` → `preparePullRequest`: local `branchLocal()` only; push `HEAD:refs/heads/${branch}` without force; `pulls.create` with no “list existing PR” reconcile.
  - `src/components/create-pr-form.tsx`: link/toast action gated on `state.prUrl`.
- **Fix:** Prefer DB intent / provisional evidence before network create, **or** make prepare truly idempotent: fetch/list existing PR for `complyloop/fix-…` head, skip recreate, return that URL, then write evidence. On write failure after a known `prUrl`, return `{ ok: false, message, prUrl }` (do not null `prUrl`). Align the user-facing retry copy with actual behavior until reconcile exists.
- **Verification:** (1) Mock `preparePullRequest` success then force `withFindingWrite` to throw — assert form state includes `prUrl` and UI can open it. (2) Integration/e2e: after orphan PR on GitHub, second action must attach `pull_request_prepared` evidence without failing push/`pulls.create`. (3) Unit: prepare path that finds an existing open PR for the branch returns its URL without calling `pulls.create` again.

### 2. Temporary exception date-only → UTC midnight (same-day expires immediately) — FIXED
- **Priority:** P2
- **Problem:** Temporary exceptions take a `type="date"` value (`YYYY-MM-DD`). Persistence does `new Date(expiresRaw).toISOString()`, which is **UTC midnight at the start of that calendar day**. Validation allows today (`trimmed.slice(0, 10) < today` — not `<=`) while the error copy says “must be in the future.” Result: choosing **today** stores an `expiresAt` already in the past for any time after 00:00 UTC, so `clearExpiredExceptions` clears it on the next assessment/status refresh. Even a future calendar day means “expires at the beginning of that day UTC,” not end-of-day as date pickers usually imply.
- **Evidence:** `src/server/actions/requirements.ts` → `markExceptionInput` superRefine (~63–69) and `markRequirementExceptionAction` (`expiresAt = new Date(expiresRaw).toISOString()`, ~171–174); `src/components/requirements/requirement-remediation-actions.tsx` (`type="date"`); `src/server/assessment-status.ts` → `clearExpiredExceptions` (`expiresAt` timestamp `> now` to keep, ~65).
- **Fix:** Normalize date-only strings to **end of UTC day** (e.g. `${date}T23:59:59.999Z`) before store/compare, **or** reject `expiresAt <= today` and document start-of-day semantics. Align validation message with the chosen rule. Prefer end-of-day so “expires 2026-09-10” covers that whole date.
- **Verification:** Mark temporary exception with `expiresAt` = today’s `YYYY-MM-DD`; assert stored instant is end-of-day (or rejection); run `clearExpiredExceptions` with `now` still on that calendar day and assert the exception is **kept**; with `now` after that end-of-day, assert it clears. Add vitest coverage in `requirements.test.ts` / assessment-status tests.

### 3. Disconnect last project leaves stale active-project cookie — FIXED
- **Priority:** P3
- **Problem:** `disconnectGitHubRepoAction` writes the next project cookie only when `nextProjectId` is truthy. Disconnecting the last visible project leaves the deleted project id in the cookie. Org switch/create already call `clearActiveProjectCookie` in the empty-project case; disconnect does not. Workspace resolve usually falls back, so this is sticky-cookie hygiene rather than a tenancy leak — but it is the same class of bug previously fixed for org switch.
- **Evidence:** `src/server/actions/connect.ts` (~181–183) vs `src/server/actions/org.ts` `switchOrgAction` / `createOrgAction` (`clearActiveProjectCookie` when no project).
- **Fix:** `else { await clearActiveProjectCookie(); }` when `nextProjectId` is null after disconnect.
- **Verification:** Disconnect the sole project; assert active-project cookie cleared (or absent); `getWorkspace().project` is null without relying on “unknown id” fallback.

---

## Fixed since last audit

| # | Was | Fix evidence |
|---|-----|----------------|
| P1 org/project tenancy | Switching to empty org kept other org’s project | `clearActiveProjectCookie` in `switchOrgAction` (`src/server/actions/org.ts`); `prepareWorkspaceState` never falls back to other orgs’ projects when `activeOrgId` set (`src/server/workspace.ts`) — re-confirmed |
| P1 file clusters by basename | `app/page.tsx` + `src/x/page.tsx` merged | `clusterFindings` keys `byFile` with full `location.filePath` (`src/core/lifecycle.ts`) — re-confirmed |
| P1 Evidence Author “System” | `ilike` never matched null actors | `evidenceFilterConditions` uses `isNull(actor)` when filter is `system` (`packages/db/src/repo/evidence.ts`) — re-confirmed |
| P1 dismiss non-open | Single dismiss lacked open guard | `dismissFindingInRows` rejects `status !== "open"` (`src/server/actions/remediation.ts`) — re-confirmed |
| P2 invalid temporary `expiresAt` | `Date` threw RangeError | zod `superRefine` rejects NaN parse + past dates (`src/server/actions/requirements.ts`) — still present; **same-day/UTC-midnight semantics filed as open #2** |
| P2 `withFindingWrite` locked cookie project | Mismatched active vs finding project | Locks/loads finding’s `projectId` first (`src/server/workspace-write.ts`) — re-confirmed |
| P2 `filters.test.ts` imports | 48 failures after zod split | `npx vitest run src/core/filters.test.ts` (in batch) → passed |
| P3 assessment evidence href | Linked to `/` marketing | `evidenceRecordHref` → `"/dashboard"` for assessment-only rows (`src/core/filter-params.ts`) — re-confirmed |
| P3 `newEvidenceRecord` overwrite | `{ id, at, ...entry }` | Spread `…entry` then set `id`/`at` (`packages/db/src/repo/mappers.ts`) — re-confirmed |

---

## Checked again — still not filed

- Auth GitHub `providerAccountId` as JWT `sub` — intentional.
- Evidence insert-only path unchanged.
- `generatePatchCandidate` leaves edits on disk on gate failure — OK under ephemeral `withProjectCheckout` temp dirs.
- `complyLoopGate` identity is checkId+file (not line) — intentional “clear this check in this file” bar; not filed.
- `approveRemediationAction` relies on `advanceRemediation` throwing for bad transitions (generic ActionState) — UI-gated; not filed as a product bug.
- Previously open P3 PR ordering **kept and upgraded to P2 #1** (mitigation copy + `prUrl` handling do not match production checkout/API behavior).

# BUG-TODO — Real bugs / logic errors

Re-checked **2026-09-10 ~22:30** (Europe/Madrid) against working tree on `refactor/remove-duplication` after P1 invite-claim + P3 PR evidence retry fixes.

Priorities: **P0** critical/breaking · **P1** important functional · **P2** normal · **P3** minor/edge.

**Open:** P0: 0 · P1: 0 · P2: 0 · P3: 0

---

## Open

_(none)_

---

## Fixed since prior audit (do not re-open)

| Was | Fix evidence |
|-----|----------------|
| P1 Org invite stays unusable until sign-out/sign-in (claim + case) | `inviteOrgMember` stores lowercase `githubLogin` (`src/server/org-membership.ts`); `listOrgIdsForUser` uses `lower(github_login)` (`packages/db/src/repo/orgs.ts`); `loadWorkspaceTenancy` calls `provisionPersonalOrg` before listing orgs so reload claims without re-auth (`packages/db/src/workspace-load.ts`). Vitest: invite lowercase (`src/server/orgs.test.ts`), case-insensitive list (`packages/db/src/repo/orgs.test.ts`), claim-before-list (`packages/db/src/workspace-load.test.ts`). |
| P3 Draft PR still created before DB evidence write | Ordering unchanged (prepare then write). Retry path locked: failed `withFindingWrite` keeps `prUrl`; second action records `pull_request_prepared`; prepare reconciles via `pulls.list` before `pulls.create` (`src/server/actions/pr.test.ts`, `src/server/pr.test.ts`). Residual: first attempt can still leave an orphan GitHub draft until retry — accepted mitigated. |
| P2 temporary exception UTC midnight / same-day expire | `normalizeExpiryInstant` → `YYYY-MM-DD` becomes `T23:59:59.999Z`; validation compares instant to now (`src/server/requirement-human-determination.ts`, `requirements.ts`) |
| P3 disconnect last project stale cookie | `disconnectGitHubRepoAction` calls `clearActiveProjectCookie` when `nextProjectId` is null (`src/server/actions/connect.ts`) |
| P2 PR retry reuse false / `prUrl` nulled | Force-push + `openPullRequestUrl` reconcile (`src/server/pr.ts`); action returns `{ ...state, prUrl }` after `runAction` (`src/server/actions/pr.ts`) |
| P1 org/project tenancy on empty org | `clearActiveProjectCookie` on org switch/create; `prepareWorkspaceState` no cross-org fallback |
| P1 file clusters by basename | `clusterFindings` keys `byFile` with full `filePath` |
| P1 Evidence Author “System” | `isNull(actor)` when filter is `system` |
| P1 dismiss non-open | `dismissFindingInRows` rejects non-open |
| P2 `withFindingWrite` locked cookie project | Locks finding’s `projectId` first |

---

## Checked — not filed

- Auth.js `?error=Configuration` on login when Postgres is down — operational (DB on `:5433` must be up); Auth.js remaps non-client-safe errors to Configuration.
- `complyLoopGate` identity is checkId+file (not line) — intentional.
- `generatePatchCandidate` leaves edits on disk on gate failure — OK under ephemeral checkout dirs.
- Feature-branch webhook pushes ignored; PR scans set `authoritative=false` and skip `applyAssessmentPayload` — correct.

# ComplyLoop — Global TODO

> Audit of the codebase as of 2026-09-26 (graph built with Graft, flows traced through the code).
> Direction, phasing and open decisions: [`docs/ai/platform-direction.md`](./docs/ai/platform-direction.md) — do not add multi-domain work here until its Phase 0.
> `CRITICAL-TODOS.md` was deleted on 2026-10-20: its items were either fixed in code or duplicated here.
> Work top to bottom. Each item stands on its own unless it says otherwise.

---

## P0 — Critical

None open.

## P1 — High

### [x] Add a cross-project portfolio overview

**Done 2026-10-20.** New `/projects` route (nav entry after Dashboard) backed by
`loadPortfolioView` + `listPortfolioForProjects`: one grouped query per metric
(requirement verdicts, open violations, unread regressions, newest completed
assessment, newest job) over the org's visible projects — no per-project
runtime load. Columns you can scan: verdict counts per status, open violations,
unread regressions, last assessment ("Never assessed"), pipeline state. Each
row opens that project's dashboard (the row switches the active project, then
redirects).

- `findings.kind` is now a typed column (`drizzle/0007_findings_kind.sql` +
  `findings_project_status_kind_idx`) so "open violations" is an indexed
  aggregate instead of a `payload->>'kind'` filter.
- Sorted by what needs attention (failed + needs_review), then open violations,
  unread regressions, staleness, name.
- Timestamps are normalised to ISO-8601 UTC in the repo layer: `timestamptz` in
  string mode comes back as the server's own text form, which would have broken
  string sorting and date rendering.

### [ ] Move repository clones out of server actions

**Why:** "Create PR" (`preparePullRequest`) and "Generate patch" (`generatePatchCandidateOnCheckout`) each do a full isomorphic-git clone plus scan inside a Vercel server action, with no `maxDuration`. That's slow, fragile under function time and disk limits, and duplicates what the worker already does. Committing a verified single-file edit doesn't need a clone at all.

**Where:** `src/server/github/pr.ts:126-278`, `src/server/assessment/ai-fix.ts:126-137`, `src/server/actions/pr.ts`, `src/server/actions/ai-fix.ts`, `src/server/assessment/repo-checkout.ts`.

**Change:**

- **PRs:** create the branch, commit and PR through the GitHub Git Data API (`git.createTree`/`createCommit`/`createRef` via Octokit) from the already-verified `candidate.edits`.
- **Patch generation:** fetch only the affected file(s) through the contents API and run the single-file scan in memory. If a full-tree check is genuinely required, enqueue it as a worker job instead.
- Afterwards, `withProjectCheckout` is used only by the worker.

**Impact:** Medium

---

## P2 — Medium

### [ ] Make the worker cheaper and faster to start

**Why:** Every 15-minute backstop runs `npm ci` _before_ the queue-depth gate (about 96 full installs a day while idle), and each manual run pays a cold runner, `npm ci` and Chromium install before scanning starts. That's minutes of latency on the most important button, and Actions minutes that grow with no traffic.

**Where:** `.github/workflows/assessment-worker.yml`, `scripts/queue-depth.ts`, `scripts/assessment-worker-drain.ts`, `src/server/assessment/assessment-scheduler.ts`.

**Change:** Gate the queue before `npm ci`, using a `psql` one-liner or a `curl` to an authenticated queue-depth endpoint. Cache `node_modules` along with the browsers. Have the drain loop until the queue is empty rather than stopping at `limit`. Show the expected start delay in the Pipeline UI.

**Impact:** Medium

### [ ] Add retention for jobs, assessments and snapshots

**Why:** Only `webhook_deliveries` and `rate_limit_buckets` are pruned. `assessment_jobs`, `assessments` and `assessment_snapshots` grow forever. Note that `findings.assessment_id` has `ON DELETE CASCADE`, so naive assessment pruning would delete findings.

**Where:** `src/server/assessment/assessment-scheduler.ts:72-90`, `packages/db/src/schema.ts` (FKs), `src/server/ops-thresholds.ts`.

**Change:**

- Make `findings.assessment_id` `ON DELETE SET NULL`, or keep assessments that findings still reference.
- Prune terminal jobs older than 30 days, and keep the last N assessments and snapshots per project, in batched deletes on the scheduler tick.
- Add table-size signals to `ops:check`.

**Impact:** Medium

### [ ] Localize the product and reports in French

**Why:** The target customers are French agencies delivering RGAA work to French clients, but the UI, finding copy and exported reports are English only (`<html lang="en">`, no i18n). This is a real adoption blocker for the stated audience.

**Where:** `src/app/layout.tsx`, `src/core/display/`, `src/server/reporting/`, `packages/analysis-core/src/catalog/rgaa/guidance.ts`.

**Change:** Adopt `next-intl` with `fr` as the default and `en` as secondary. Start with the exported audit/engineering reports and the finding explanation copy (the text clients actually read), then move on to app chrome.

**Impact:** Medium

### [ ] Remove experimental and prerelease production dependencies

**Why:** Auth runs on `next-auth@5.0.0-beta.32`, and production builds enable `reactCompiler` plus `experimental.turbopackRustReactCompiler`. Both add upgrade-breakage risk for no product gain.

**Where:** `package.json`, `next.config.ts:111-118`, `src/auth.ts`.

**Change:** Drop the experimental Rust compiler flag, and keep `reactCompiler` only if the build and e2e stay green without it being experimental. Either pin next-auth to its latest release and track stable v5, or migrate to Better Auth (GitHub OAuth only is simple to move).

**Impact:** Low

### [ ] Delete dead code and stale docs, and keep them out

**Why:** The code was AI-generated and has drifted. knip finds 21 unused exports and 46 unused exported types, and barrels duplicate modules (`src/core/display.ts` vs `src/core/display/*`, `src/core/filter-params.ts` vs `filter-params/*`).

**Where:** `src/core/display.ts`, `src/core/filter-params.ts`, knip output, `docs/ai/architecture.md` (update after the P0/P1 changes above).

**Change:**

- ~~Delete `CRITICAL-TODOS.md`.~~ Done 2026-10-20 (stale: most items were already fixed).
- Remove the unused exports and the duplicate barrels.
- Add `knip` (with a config that ignores `e2e/fixtures`) to the CI `quality` job.
- Rewrite the write-model and assessment sections of `architecture.md` once the items above land.

**Impact:** Low

### [ ] Close the known gaps in the runtime checks

**Why:** The flaky probes were retired and the remaining ones were hardened (full tab-order walk, in-page write guard, no CSS injection), but three limits remain and users can hit them.

**Where:** `packages/analysis-core/src/runtime/custom-checks/focus.ts` (`MAX_TAB_STEPS`), `packages/analysis-core/src/runtime/incomplete-resolver.ts`.

**Change:**

- The focus walk stops at 80 stops, so very long tab orders are only partly checked. Raise the cap, or report "walk truncated" instead of a clean pass.
- Gradient-clip text (`bg-clip-text text-transparent`) and translucent pills cannot be measured, so they stay `needs_review` contrast warnings. Teach the resolver to sample the rendered pixels for them, or document them as manual-review cases.
- After the next deploy, check that `/findings/<id>` loads in production (the `axe-core*` trace-exclusion 500 fix) and re-run Oruva once its `globals.css` shadow fix reaches `develop`.

**Impact:** Low

---

## Biggest Wins

1. **Replace the load-everything write model with targeted writes.** It simplifies every action and removes cost that grows with project age.
2. **Add a portfolio overview.** It makes the product usable for its real customer, an agency with many clients.
3. **Ship retention.** Jobs, assessments and snapshots grow forever today, and `findings.assessment_id` cascades — pruning needs a migration first.

## Target State

- Pull requests get a ComplyLoop check that lists new violations before merge. The default branch keeps the authoritative project state. (**Blocked:** a recorded Sep 2026 decision forbids per-PR Check Runs until **D-CI** is recorded — see `platform-direction.md`.)
- Mutations are plain transactions with a per-project lock and explicit row writes, with no whole-project loads, snapshots or diffs.
- Queried fields are typed, indexed columns. JSONB holds only detail payloads.
- Request handlers never clone repositories. Heavy work runs on the worker, and GitHub writes go through the API.
- AI is opt-in, uses a zero-retention model with structured output, and stays advisory.
- Agency leads see every client project's compliance state on one page, in French.
- Tables have retention, the worker is cheap when idle and quick to start, and CI rejects dead code.

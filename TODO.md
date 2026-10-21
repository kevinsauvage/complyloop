# ComplyLoop — Global TODO

## P2 — Medium

### [x] Make the worker cheaper and faster to start

**Done 2026-10-21.**

- The queue gate now runs **before** checkout/`npm ci`, via a `psql` one-liner
  (`ubuntu-latest` ships the client) against `DATABASE_URL`. An idle 15-minute
  tick costs seconds; `scripts/queue-depth.ts` was deleted (it existed only to
  serve the old post-install gate).
- `node_modules` is cached alongside the Playwright browsers, and `npm ci` only
  runs on a cache miss.
- The drain loops batches until the queue is idle or `ASSESSMENT_WORKER_MAX_MS`
  (default 20 min) elapses; `ASSESSMENT_WORKER_LIMIT` is now the per-batch claim
  size, not a total.
- The dashboard Pipeline card shows the expected start delay on queued jobs.

### [x] Add retention for jobs, assessments and snapshots

**Done 2026-10-21.** No migration: `findings.assessment_id` stays
`ON DELETE CASCADE`, and `repo/retention.ts` only deletes assessments **no
finding references** (the TODO's second option), so provenance and remediation
history survive.

- `prunePipelineRetention` runs on the worker tick (`runAssessmentJobBatch`):
  terminal jobs older than 30 days, then the oldest assessments beyond the
  newest 30 per project, batched (`batchSize`/`maxBatches`). Snapshots cascade.
- `ops:check` reports `assessment_jobs` / `assessments` /
  `assessment_snapshots` sizes and fails above `OPS_MAX_PIPELINE_TABLE_MB`
  (default 512 MiB).
- DB integration test: `packages/db/src/repo/retention.test.ts` (in `test:db`).

### [x] Remove experimental and prerelease production dependencies

**Done 2026-10-21.**

- `experimental.turbopackRustReactCompiler` removed. `reactCompiler: true` stays
  (stable in Next 16) on the stable path, backed by
  `babel-plugin-react-compiler` (devDependency); build is green.
- `next-auth` is already pinned to `5.0.0-beta.32`, which **is** the latest v5 —
  Auth.js has no stable v5 upstream (`dist-tags.latest` is v4). Migrating to
  Better Auth is a deliberate auth/RBAC migration, not drift; rationale recorded
  in `docs/ai/architecture.md` (§ Dependency notes).

### [x] Delete dead code and stale docs, and keep them out

**Done 2026-10-21.**

- `knip` added (`knip.json`, `npm run knip`) and wired into the CI `quality`
  job; `ignoreExportsUsedInFile` + explicit entry globs keep the signal real.
- Removed: unused `project-description.ts`, `FilterChipList`, `fakeTx`, and the
  never-consumed `SheetClose`/`SheetFooter`/`SheetDescription` /
  `TableFooter`/`TableCaption` primitives.
- **The duplicate-barrel claim was stale:** `src/core/display.ts` and
  `src/core/filter-params.ts` are the documented canonical entry points
  (~20 consumers each), not duplicates of `display/*` / `filter-params/*`. Kept
  deliberately; knip is clean, so they are not dead code.
- `docs/ai/architecture.md` updated: new dependency-notes section, retention
  documented, worker drain behaviour recorded.

### [ ] Close the known gaps in the runtime checks

**Code half done 2026-10-21; one operator check remains.**

- Focus walk budget is now `MAX_FOCUS_TAB_STEPS = 200`. A longer tab order emits
  an `advisory` warning on each focus check (`focus-visible`, `keyboard-trap`,
  `focus-not-obscured`), which lands as `warning`/`needs_review` — a truncated
  walk can no longer read as a clean pass.
- Gradient-clip text and translucent pills are documented as manual-review
  cases (`incomplete-resolver.ts` + `packages/analysis-core/README.md`); they
  already stay `needs_review`.
- **Remaining (operator, needs a deploy):** after the next deploy, confirm
  `/findings/<id>` loads in production (the `axe-core*` trace-exclusion 500 fix
  is already in `next.config.ts`) and re-run Oruva once its `globals.css`
  shadow fix reaches `develop`.

**Impact:** Low

---

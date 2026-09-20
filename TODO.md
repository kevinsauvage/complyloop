# ComplyLoop — Global TODO

## P1 — High Priority

> **Superseded (Sep 2026):** the two items below assumed per-PR preview scans
> with Check Runs. PR previews were removed — feedback now arrives via the
> merge-push scan — so these items are parked until/unless a PR-scan topology
> returns. The fingerprint idea stays valid for merge-push regression
> classification.

### [ ] Stable finding fingerprint + new-vs-resolved delta against the default-branch baseline

**Why:** There is no cross-run finding identity — dedupe is within-run only (`packages/analysis-core/src/merge-findings.ts`), findings carry raw `filePath:line` locations (`contract/location.ts`), and grep confirms no fingerprint exists. Absolute counts on a 3-line PR teach developers to ignore the check; SonarQube/Semgrep treat new-code-only reporting as the commodity bar. This is the single highest-leverage product change and the prerequisite for annotations, comments, and any gating.
**Change:** V1: pure fingerprint function in `packages/analysis-core` (`checkId + normalized filePath + anchor` — anchor on selector/structural hash, not raw line, to survive line shifts); persist it on findings (migration — ask-first per AGENTS.md: `drizzle/` + `contract/`); preview runs classify against the latest authoritative assessment (which _is_ the baseline — no new baseline entity): `new | persisted | resolved`; Check summary shows `+N new · −M resolved · net Δ · no new critical`. Treat renames as new+resolved pair with an explicit note. Previews still persist nothing (existing invariant + test must stay green).
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

# GitHub Integration — Feature Discovery & Improvement Audit

> Scope note: docs were verified against implementation. Where they disagree, implementation wins (cited `file:line`). No code was modified. All GitHub capabilities below were verified against current official docs (fetched Sep 2026; API version `2026-03-10`).
>
> **⚠️ HISTORICAL — proposals here are superseded (Sep 2026).** Per-PR preview
> scans and Check Run posting were deliberately removed (`6644864`): webhook
> intake is push-only and the merge-push scan is the only assessment trigger
> besides manual runs. Treat §4–§11 (PR Checks, `check_run.rerequested`, PR
> annotations, PR summary comments, scoped PR scans, Actions/Issues proposals)
> as a record of considered-and-rejected options, **not** a backlog — do not
> re-propose them without a new product decision (see
> [`architecture.md`](./architecture.md)). §1–§3 (auth, tokens, connect,
> draft-PR creation) remain current.

---

## 1. Current GitHub integration architecture

### Current-state model (as built, not as documented)

```text
User (GitHub OAuth, identity-only)
 ↓
OAuth user token (AES-256-GCM in github_tokens, lazy refresh)
 ↓
GitHub App installation ←→ resolveUserInstallationForRepo (anti-spoof)
 ↓
Installation token (ephemeral, ~1h, never stored)
 ↓
Repositories (connect = ephemeral-clone validation + project.github binding)
 ↓
Assessment (enqueue → repository_dispatch → GH Actions worker → claim → clone → scan → persist)
 ↓
Findings → Remediation → Verification (deterministic re-check only)
 ↓
Evidence (append-only) → Monitoring (webhook enqueue + regression alerts)
```

GitHub participates at **6 points** today:

| #   | Participation point                                                                                                             | Code                                                                                                                                        | Authoritative?                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | Sign-in + repo discovery (OAuth)                                                                                                | `src/auth.ts:48-55`, `src/app/api/github/repos/route.ts:24-78`                                                                              | n/a (identity)                                                 |
| 2   | Connect repo (OAuth→installation resolution, installation-token validation clone)                                               | `src/server/actions/connect.ts:76-166`, `src/server/workspace/connect-github.ts:118-162`                                                    | writes `project.github{fullName,defaultBranch,installationId}` |
| 3   | Webhook enqueue (`push` default-branch only; `pull_request opened/synchronize/reopened`)                                        | `src/app/api/github/webhook/route.ts:32-130`, `src/server/github/webhook.ts:175-251`                                                        | enqueue only, never scans inline                               |
| 4   | Worker kick (`repository_dispatch assessment-drain` + 15-min schedule backstop)                                                 | `src/server/assessment/assessment-job-dispatch.ts:42-69`, `.github/workflows/assessment-worker.yml:24-41`                                   | trigger only                                                   |
| 5   | Checkout at job `ref` (installation token, isomorphic-git, ephemeral, deleted after)                                            | `src/server/assessment/repo-checkout.ts:205-304`                                                                                            | scan input                                                     |
| 6   | PR Check Run (preview: verdict posted, **nothing persisted**); failure Check Run on terminal crash; draft-PR creation for fixes | `src/server/assessment/assessment-worker.ts:179-192,272-282`, `src/server/github/github-checks.ts:27-125`, `src/server/github/pr.ts:52-246` | preview only                                                   |

Key architectural facts that constrain every proposal:

- **PR-head scans are previews by design.** `authoritative = !pullRequestHeadSha` (`assessment-worker.ts:62`). They run the same analysis to post a Check Run but never resolve findings, flip statuses, or auto-verify, and persist nothing (`architecture.md:206-207`).
- **Only default-branch pushes are authoritative.** Feature-branch pushes are ignored (`webhook.ts:154-163,215-225`). So today a PR's only GitHub footprint is one completed Check Run with counts.
- **Jobs are serial per project, 30-min lease + 5-min heartbeat, 3 attempts** (`assessment-jobs.ts:53-61`). Webhook deliveries coalesce (newest `ref` wins, push vs PR never coalesce) with `supersededRefs` tracked (`assessment-jobs.ts:170-225`).
- **No Vercel Cron / worker process.** `vercel.json` is schema-only; all scheduling is GitHub Actions (`assessment-worker.yml` dispatch + `*/15` + manual; `ops-check.yml` daily).
- **Verification is deterministic and fail-closed.** Interactive re-check covers dom/site only; source findings verify only via merge + re-assess (`remediation-verify.ts:53-54,241-245`, `assessment.ts:160+`). AI never writes statuses.
- **Scoped re-scan already exists.** `detectChanges` hashes files vs `assessment_snapshots.fileHashes` (`monitor.ts:98-119`); AST can run scoped (`scanChangedFiles`, `assessment.ts:437-451`); resolves apply only within `scopedFileSet` (`assessment.ts:196-210`, tested in `assessment-findings.test.ts:413-427`). This is the seed of changed-code diffing — but there is **no stable cross-run finding fingerprint** (findings carry `filePath:line`-style locations, `contract/location.ts:42`; dedupe is within-run only, `merge-findings.ts:133-179`).

### Docs-vs-code discrepancies (minor)

- ~~`architecture.md` says "`POST /api/internal/jobs/run` stays for schedulers" — correct, but it reads as co-primary; in reality it is the **degraded fallback** (`route.ts:67-140`, `maxDuration=300`), the GH worker is primary.~~ **Fixed Sep 2026:** `src/app/api/` now holds only `auth/`, `github/`, `health/`, `projects/` — the `POST /api/internal/jobs/run` route no longer exists. The GitHub Actions `assessment-worker` workflow (dispatch + 15-min schedule backstop) is the sole executor; remove any remaining `architecture.md` reference to the internal route.
- `.env.example:37` / `README.md:46` document App permissions (`Contents R/W, Pull requests R/W, Checks R/W, Metadata R`) — these are prose, not code-enforced. Any permission addition must update those two files plus the App registration manually.
- No stale TODOs in the GitHub/worker surface (grep clean); limitations live as documented prose instead.

---

## 2. Token and permission capabilities (verified)

### Token kinds

| Kind                                                                      | Minted by                         | Lifetime                                                                                                            | Boundary                                           | Calls GitHub for                                                  |
| ------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| Session JWT (cookie)                                                      | Auth.js (`AUTH_SECRET`)           | 30d / sliding 24h                                                                                                   | identity (`sub` = GitHub account id)               | nothing                                                           |
| OAuth user token `gho_*` (encrypted row in `github_tokens`, PK `user_id`) | GitHub OAuth on sign-in           | ~8h, lazy refresh-token rotation; `revoked` → row deleted, `transient` → row kept                                   | `read:user user:email` only — **cannot read code** | installation listing, `repos.get` at connect, username typo-guard |
| Installation token `ghs_*` (ephemeral, never stored)                      | `@octokit/auth-app` per operation | ~1h (GitHub-controlled; stateless `ghs_APPID_JWT` format rolling out since Apr 2026 — do not assume 40-char tokens) | repos the installation covers                      | clone, PR create/push, Check Runs                                 |
| Webhook HMAC secret                                                       | operator                          | long-lived                                                                                                          | verify `x-hub-signature-256`                       | verification only                                                 |
| `WORKER_SECRET` Bearer / `GH_WORKER_DISPATCH_TOKEN` PAT                   | operator                          | long-lived                                                                                                          | job trigger / dispatch                             | dispatch only                                                     |

Production enforces **both** OAuth and App (`assertProductionGitHubApp`, `auth.ts:38-41`, `github-app.ts:41-56`): least-privilege shape is structural, not optional. Installation IDs are never trusted from the client (must appear in the user's own installation list **and** expose the repo, `github-app.ts:108-161`); webhooks double-check `payload.installation.id === project.installationId` (`webhook.ts:192-201`).

### Capability matrix (current App permissions: Contents R/W, Pull requests R/W, Checks R/W, Metadata R)

| Capability                                   | Currently possible                                | Permission required                                                | Already implemented                                                           | Potential use                                                                                              |
| -------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Read repositories / metadata                 | ✅ (installation)                                 | Contents R (have)                                                  | picker + `repos.get`                                                          | repo intelligence (framework, CI, CODEOWNERS) — needs Contents R only                                      |
| Read files (`contents` API)                  | ✅                                                | Contents R (have)                                                  | not used (clone instead)                                                      | CODEOWNERS read, CI/config detection without full clone                                                    |
| Read commits / branches                      | ✅                                                | Contents R (have)                                                  | via local git only                                                            | compare/base resolution via API                                                                            |
| Compare base...head / list PR files          | ✅                                                | Contents R (have)                                                  | not used                                                                      | changed-file scoping for PR scans (high value)                                                             |
| Read pull requests                           | ✅                                                | Pull requests R (have)                                             | `pulls.list` for reconcile only                                               | PR metadata, base SHA, changed-file counts                                                                 |
| Create pull requests                         | ✅                                                | Pull requests W (have)                                             | draft fix-PRs                                                                 | unchanged                                                                                                  |
| Comment on PRs (issue comments)              | ✅                                                | Pull requests W¹ (have)                                            | **not used**                                                                  | upserted summary comment                                                                                   |
| Inline review comments                       | ✅                                                | Pull requests W¹ (have)                                            | **not used**                                                                  | per-finding line comments (caution: noise)                                                                 |
| Create/update Checks (+ annotations, 50/req) | ✅                                                | Checks W (have)                                                    | completed-only, no annotations, no `details_url`                              | in-progress lifecycle, annotations, details links, re-request                                              |
| Read checks                                  | ✅                                                | Checks R (have)                                                    | not used                                                                      | detect existing a11y checks (avoid duplication)                                                            |
| Commit statuses                              | ✅                                                | Commit statuses² (have via Contents? **no** — separate permission) | not used                                                                      | avoid; Checks supersede                                                                                    |
| Webhooks (`push`, `pull_request`)            | ✅                                                | configured                                                         | handled; `check_run.rerequested`, `installation*`, `push` non-default ignored | `check_run rerequested` (Re-run button), `installation_repositories added/removed` (stale binding hygiene) |
| Read/create Issues                           | ❌                                                | Issues R/W (**not granted**)                                       | not used                                                                      | grouped export opt-in only; see Avoid                                                                      |
| Read reviews / request reviewers             | ❌/⚠️                                             | Pull requests R (have) for read                                    | not used                                                                      | CODEOWNERS-aware reviewer surfacing without requesting                                                     |
| Read workflows / workflow runs               | ❌                                                | Actions R (**not granted**)                                        | not used                                                                      | detect existing axe/Lighthouse CI (needs new permission — weigh it)                                        |
| Read deployments / releases                  | ❌                                                | Deployments R (**not granted**)                                    | not used                                                                      | runtime-scan targeting; probably unnecessary                                                               |
| Branch protection / Rulesets read            | ❌                                                | Administration R (**not granted**)                                 | not used                                                                      | gate-readiness display; do not take Admin for this alone                                                   |
| Code search                                  | ⚠️ (installation token can, but expensive)        | Contents R                                                         | not used                                                                      | avoid; clone+AST is cheaper and already local                                                              |
| SARIF / code-scanning upload                 | ⚠️ (needs `security-events: write`, Actions-side) | n/a (workflow permission)                                          | not used                                                                      | deliberate Avoid (see §9)                                                                                  |

¹ Issue comments on PRs and review comments both flow from Pull requests W on an installation token — no new permission needed.
² Commit statuses require the "Commit statuses" permission explicitly; Checks W does not imply it. Prefer Checks anyway.

**Headline: the highest-value PR features (summary comments, inline comments, rich Checks with annotations, changed-file scoping, CODEOWNERS read, re-run support) require zero new permissions.** Issues, Actions, Deployments, Administration reads each cost a permission-broadening with real security/review-surface trade-offs — grant only with a validated need.

---

## 3. GitHub capabilities researched (official docs, Sep 2026)

- **Checks API** (`POST/PATCH /repos/{o}/{r}/check-runs`): App-only creation (OAuth/PAT cannot create); `status queued|in_progress|completed`, `conclusion success|failure|neutral|cancelled|skipped|timed_out|action_required`; `output{title,summary(markdown),text(markdown),annotations[],images[]}`; **annotations: max 50 per request**, appended on each update, `path/start_line/end_line/(start_column,end_column same-line only)`, `annotation_level notice|warning|failure`; `details_url`, `actions[]` (≤3), `rerequest` endpoint firing `check_run.rerequested`. Fork pushes return empty `pull_requests`. Sources: `docs.github.com/en/rest/checks/runs`, `…/using-the-rest-api-to-interact-with-checks`.
- **Installation tokens**: JWT → `POST /app/installations/{id}/access_tokens`, 1h expiry, optional per-repo / per-permission down-scoping (`repositories`, `permissions` params); new stateless `ghs_APPID_JWT` format (Apr 2026 rollout) — length assumptions break. Source: `…/generating-an-installation-access-token-for-a-github-app`.
- **Webhooks**: `push`, `pull_request` (we handle a subset), plus `check_run` (`created|completed|rerequested|requested_action` — needs Checks W for re-request types, which we have), `installation` / `installation_repositories` (`added|removed`, auto-delivered), `issue_comment`, `pull_request_review_comment`. Payload cap 25 MB; `X-Hub-Signature-256` verify. Source: `…/webhook-events-and-payloads`.
- **Review comments** (`POST /repos/{o}/{r}/pulls/{n}/comments`): diff-anchored (`commit_id+path+line+side`, multi-line via `start_line/start_side`); `PATCH/DELETE` supported (update/delete own comments → upsert-without-spam pattern); replies endpoint; secondary-rate-limit warning on rapid creation. **Issue comments** (`POST /repos/{o}/{r}/issues/{n}/comments`, `PATCH`) suit upserted summary comments. Sources: `…/rest/pulls/comments`, `…/rest/issues/comments`.
- **Compare / PR files** (`GET …/compare/{base}...{head}`, `GET …/pulls/{n}/files`): `status added|removed|modified|renamed(+previous_filename)|copied`, `patch` per file; compare paginates (250 commits default, files on first page, ≤300 files). Enables changed-file scoping without cloning the base. Sources: `…/rest/commits`, `…/rest/pulls/pulls`.
- **CODEOWNERS**: `CODEOWNERS` in `.github/|root|docs/`, last-match-wins, ≤3 MB, invalid lines skipped, errors API available; owners auto-requested for review; branch protection can require code-owner review; Rulesets as the newer alternative. Source: `…/about-code-owners`.
- **Code scanning / SARIF**: third-party SARIF upload via `github/codeql-action/upload-sarif` needs `security-events: write`; PR mapping automatic (push-mapped or `pull_request`-triggered); multi-tool via `category` / `runAutomationDetails.id`. Source: `…/upload-sarif-file`, `…/workflow-configuration-options`.

---

## 4. Current developer workflow (where ComplyLoop does/doesn't show up)

```text
write code → push → PR → CI → review → merge → production
                ↑       ↑     ↑              ↑         ↑
           (ignored   (thin  (absent —     (draft    (re-assess
            if non-   Check   no CI         fix PR    on push,
            default)  counts) awareness)   on demand) alerts)
```

Concretely: the developer's PR experience today is a single completed Check Run titled "N open violation(s), M failed requirement(s)" with counts and an assessment id, no file/line anchors, no delta vs base, no in-progress state, no re-run path, no link into the finding (`github-checks.ts:71-125`). Everything else (explanation, remediation, evidence) requires leaving GitHub for the ComplyLoop dashboard. Post-merge, the loop is strong (authoritative re-assess, auto-verify of source fixes, regression alerts). **The gap is entirely pre-merge.**

---

## 5. Workflow opportunities (analyzed, not just listed)

### PR Checks as the primary dev interface (recommend: yes, carefully)

Problem: compliance signal lives in the dashboard; the PR shows only counts. Developers context-switch or ignore it.
ComplyLoop workflow: `queued → in_progress` Check on `opened/synchronize` (job claim sets it; fail-open on API error, warn-never-throw as today), `completed` with severity breakdown + new/resolved delta + per-file annotations + `details_url` deep-linking the finding page. `neutral` (not `failure`) for heuristic/unable-to-verify-only results so deterministic authority is preserved in the signal itself: AI-assisted info must never look like a verdict.
Dependency: Checks W (have). Complexity M, UX M, security Low.

### Changed-code delta: new vs fixed (recommend: V1 counts+list, V2 line-anchored)

Problem: "12 open violations" on a 3-line PR teaches developers to ignore the check.
Feasibility: genuinely supportable. Building blocks exist: PR-head preview scans run full analysis already; `assessment_snapshots.fileHashes` + `detectChanges` give content diffing; `scopedFileSet` semantics prevent out-of-scope resolves; PR files/compare APIs give the base↔head file list with renames. Missing piece: a **stable finding fingerprint** (`checkId + normalized filePath + anchor`) persisted per assessment so run N+1 can classify `new | persisted | resolved`. Rename/move handling (`previous_filename` from compare API) is the known hard edge — V1 should treat renames as new+resolved pair and say so, not pretend certainty.
UX target: `+2 new · −5 resolved · net −3 · no new critical` + link. Complexity M (V1) → H (V2 with annotations), security Low (read-only compare API).

### Inline annotations over inline comments (recommend: annotations first)

Problem: developers need file:line grounding.
Analysis: Check annotations render in Files-changed, are batched (50/req), require no comment-thread management, and disappear with the run rather than spamming timelines. Review comments notify louder and persist — appropriate only for a small number of new critical/high-confidence source findings, with update-in-place keyed by fingerprint. Cap counts, never comment on pre-existing debt, and resolve/outdate rather than re-post on `synchronize`. Complexity M, UX H (noise tuning is the work), security Low.

### Baseline / existing debt (recommend: yes, implicit not explicit)

Problem: legacy debt fails every PR → gates get disabled.
Model: default-branch authoritative scan = implicit baseline (already the persistence semantic); PR preview reports **only delta vs that baseline**. No separate baseline object to create/store/version in V1 — the latest authoritative assessment per project _is_ the baseline. Explicit pinned baselines (per-release, per-branch) are V2/Explore. Rename/move noise and finding-identity stability are the reliability gates before any blocking use. Complexity M, security Low.

### Compliance-as-CI gating (recommend: advisory-first, blocking strictly opt-in and narrow)

Problem: teams want "don't merge new critical a11y regressions" without blocking on noise.
Critical analysis: blocking on heuristic AST, runtime-only `unable_to_verify`, or AI-suggested content is unsound and will train teams to bypass the check. A defensible gate is: `failure` **only** for new deterministic high-confidence source findings on changed lines (standard-authority checks); everything else `neutral`/`success` with summary text. Ruleset/branch-protection integration is then documentation + required-check naming, not code. Do not build merge-blocking until delta precision is measured (see Validation in TODOs). Complexity M, UX H, product risk H if over-broad.

### Commit-level / push analysis (recommend: keep ignoring feature pushes)

The current "ignore non-default pushes" is correct: per-commit scans would multiply jobs against a serial-per-project queue with no additional verdict value. PR-head scans already cover the pre-merge surface. No change.

### Repository intelligence (recommend: yes, cheap reads)

Problem: assessment config is manual; ComplyLoop doesn't know the repo's framework, a11y tooling, CI, or owners.
Reads available under current permissions: `CODEOWNERS` + framework signals (`package.json` deps, app-router markers) + CI workflow presence via `contents` API (no new permission, no full clone). Value: auto-suggest `runtimeBaseUrl` need, preset scope, reviewer routing display, and "you already run axe in CI — here's what we add" messaging. Complexity L, security Low. (Reading _workflow run results_ needs Actions R — defer; static presence detection covers 80%.)

### Existing CI awareness (recommend: presence, not ingestion, in V1)

Detecting axe/Lighthouse/previous a11y jobs via Checks list (have Checks R) lets the summary say "your axe job also ran" and avoids ComplyLoop looking duplicative. Consuming external CI results as evidence is Avoid: provenance/identity of third-party results can't meet the deterministic-evidence bar.

### CODEOWNERS routing (recommend: display, not auto-assign)

Finding → file → CODEOWNERS owner is computable from one file read. Value is real (route the fix to the owning team in the summary/details link). Auto-requesting review or assigning is Avoid: surprising, permission-adjacent, and duplicates GitHub's own owner-review mechanics.

### Issues sync (recommend: Avoid as sync; Explore as one-way opt-in export)

One issue per finding duplicates the finding lifecycle (statuses, verification, evidence) in a weaker system with two sources of truth and auto-close races. Grouped/labelled export for teams that triage in GitHub is a defensible opt-in V2, but only one-way (ComplyLoop → GitHub, never state back). Default: no.

### GitHub Action `complyloop.yml` (recommend: Explore, not Now)

A marketplace Action (like ScanAccess/a11yscout patterns: `pull_request` trigger, SARIF + PR comment outputs, `fail-on` threshold) would serve repos that want CI-owned scanning. But ComplyLoop's architecture is App+worker-based with installation-token auth and a queued topology; an Action duplicates the trigger path, reintroduces fork-PR secret handling and duplicate-assessment prevention, and splits the product into two execution models. Only justified if a validated segment can't install the App.

### PR summary comment (recommend: yes, single upserted comment)

One `<!-- complyloop -->`-marked issue-comment, updated in place per `synchronize` (find by marker, `PATCH`), containing delta + severity + links. Solves "Checks tab is easy to miss" with minimum interruption. Needs PR W (have). Must not post on every push as a new comment — update-or-nothing.

### Notifications (recommend: minimum viable interruption)

Checks (passive) → upserted summary (visible) → inline annotations (grounded). Nothing else notifies. No reviews, no assignments, no issue spam.

---

## 6. Feature opportunity map

| Feature                                                                                                             | User problem                                       | GitHub capability                                  | Required permission    | Value                                                    | Frequency           | Complexity      | Security                              | Differentiation                                                     |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- | ---------------------- | -------------------------------------------------------- | ------------------- | --------------- | ------------------------------------- | ------------------------------------------------------------------- |
| **A. Rich Check lifecycle** (queued/in_progress, severity breakdown, details_url, failure-only-on-crash vs verdict) | PR shows a bare count; no progress, no link in     | Checks create+update (have)                        | none (Checks W have)   | High — makes the check legible                           | every PR            | Tech M / UX M   | Low                                   | commodity done well                                                 |
| **B. Check annotations (file:line)**                                                                                | findings aren't grounded in code                   | Check annotations ≤50/req (have)                   | none                   | High — primary dev interface                             | every PR            | Tech M / UX M   | Low                                   | useful but common (Sonar/Semgrep pattern)                           |
| **C. New-vs-fixed delta vs default-branch baseline**                                                                | "12 violations" on a 3-line PR = ignored           | PR files/compare + finding fingerprint (new table) | none (Contents R have) | Very high — the feature that makes PR checks trustworthy | every PR            | Tech M→H / UX M | Low                                   | **differentiated** (deterministic + RGAA mapping, not generic lint) |
| **D. Upserted PR summary comment**                                                                                  | Checks tab is missed; timeline has no record       | Issue comments create+PATCH (have)                 | none (PR W have)       | High                                                     | every PR            | Tech L / UX M   | Low                                   | commodity                                                           |
| **E. Re-run support** (`check_run.rerequested` → enqueue)                                                           | stale/red check has no self-serve retry            | `check_run` webhook + rerequest (have)             | none                   | Medium                                                   | occasional          | Tech L / UX L   | Low (HMAC + project binding as today) | commodity, expected                                                 |
| **F. Scoped PR scan** (analyze changed files fast, full scan for verdict)                                           | PR feedback is slow (full clone+scan per push)     | PR files/compare for scope set                     | none                   | Medium-High (speed)                                      | every PR            | Tech M / UX L   | Low                                   | differentiated if verdict stays full-scan honest                    |
| **G. Repo intelligence** (framework/tooling/CI/CODEOWNERS detection)                                                | manual config, unknown overlap with existing tools | Contents read (have)                               | none                   | Medium                                                   | per connect + drift | Tech L / UX L   | Low                                   | useful, uncommon in a11y                                            |
| **H. CODEOWNERS-aware owner display**                                                                               | fixer doesn't know the owning team                 | CODEOWNERS read (have)                             | none                   | Medium                                                   | per finding         | Tech L / UX L   | Low                                   | useful                                                              |
| **I. Policy-gated conclusions** (failure only for new deterministic findings; neutral otherwise)                    | false-positive gates get disabled                  | Checks conclusions (have)                          | none                   | High (trust)                                             | every PR            | Tech M / UX H   | Low                                   | **potentially core** (deterministic authority as UX)                |
| **J. Limited inline review comments** (new criticals only, capped, updated in place)                                | criticals need louder signal than annotations      | Review comments (have)                             | none                   | Medium                                                   | few PRs             | Tech M / UX H   | Low (secondary rate limits)           | common; keep narrow                                                 |
| **K. One-way grouped issue export** (opt-in)                                                                        | some teams triage in GitHub                        | Issues W (**new**)                                 | Issues R/W             | Low-Medium                                               | opt-in manual       | Tech M / UX M   | Medium (scope broadening)             | weak — duplicates own workflow                                      |
| **L. SARIF upload to code scanning**                                                                                | Security-tab visibility                            | `upload-sarif` (`security-events: write`)          | workflow-side          | Low for a11y                                             | per scan            | Tech M / UX L   | Medium                                | commodity; wrong surface for RGAA evidence                          |
| **M. ComplyLoop GitHub Action**                                                                                     | CI-owned scanning without App install              | Actions/marketplace                                | n/a                    | Medium (reach)                                           | per repo setup      | Tech H / UX M   | Medium-H (fork secrets, dup runs)     | strategic but duplicative                                           |
| **N. Consume external CI results as evidence**                                                                      | avoid duplicate scanning                           | Actions R / Checks R (**new partly**)              | Actions R              | Low (provenance fails evidence bar)                      | —                   | Tech H          | Medium                                | avoid                                                               |

---

## 7. Competitive research (current sources)

- **SonarQube (Server 2026.1 / Cloud)**: PR decoration = Checks + Conversation summary + inline annotations in Files-changed, "new code" definition (`referenceBranch`), quality gates block on _new_ issues, coverage/duplication tracking. Takeaway: (1) new-code-only reporting is the commodity bar — ComplyLoop lacks it; (2) quality-gate-on-new is the proven gating shape — copy the shape, narrow the rule set to deterministic findings. Source: `docs.sonarsource.com/.../in-devops-platform/github`, `…/setting-up-the-pull-request-analysis`.
- **Semgrep**: Block/Comment policy modes per rule; PR comments only for rules meeting severity/confidence policy; "require conversation resolution" as the soft gate. Takeaway: policy-per-rule + conversation-resolution is the right intermediate between advisory and blocking. Source: `docs.semgrep.dev/.../github-pr-comments`.
- **CodeRabbit / AI reviewers**: walkthrough + inline comments with suggested fixes, Quiet/Chill/Assertive noise profiles, progress via check runs, "don't require AI review as a check; require conversation resolution instead." Takeaway: noise profiles and non-blocking-AI are validated patterns; ComplyLoop's deterministic findings can go further (block narrowly) precisely because they aren't LLM output. Source: `docs.coderabbit.ai/tools/github-checks`, `dev.to/.../how-to-set-up-ai-code-review-in-github-actions`.
- **Accessibility-native**: `github/accessibility-scanner` (Action → grouped/one-per-rule Issues + Copilot fix assignment — the Issues-sync pattern we recommend against as default); ScanAccess/a11yscout (Action with render + static-changed-files modes, PR comment + SARIF, `fail-on` thresholds). Takeaway: (1) changed-files static mode as a fast first gate is validated — maps to our scoped-scan proposal; (2) per-finding Issues are the incumbent pattern and widely considered noisy — reinforces Avoid on K-by-default; (3) nobody owns _deterministic verify + append-only evidence linked from the PR_ — that is ComplyLoop's open differentiation. Sources: `github.com/github/accessibility-scanner`, `scan-access.com/integrations/github`, `github.com/jpatel3/a11yscout`.
- **accessiBe Code Agent (Sep 2026, PR)**: inline PR review with exact-line fixes, thresholds/exclusions, require-to-pass option, same-engine-from-PR-to-production narrative. Validates the PR-inline direction; ComplyLoop's answer should be the same surface with a stronger verifiability story. Source: PR Newswire 2026-09-17.

**Commodity ComplyLoop should have**: new-code-only PR reporting, rich check with annotations, upserted summary, re-run, `fail-on`-style policy. **Poorly served**: deterministic a11y gating (everyone blocks on noisy signals or blocks on nothing), finding-identity across runs, verify-linked evidence from the PR. **ComplyLoop-specific opening**: fix → merge → auto-verify → evidence is already built; surfacing that chain inside the PR (resolved-count, verify links) is a moat no scanner above has.

---

## 8. Security considerations (per proposal)

- **No new permissions for A–J.** All use Contents R / PR R/W / Checks R/W already granted. State this in the App listing; permission stability is itself a trust feature.
- **K/L/M/N each broaden surface**: Issues W (write to user discussion space), `security-events` (code-scanning write), Action distribution (secret handling in forks), Actions R (CI metadata). Each needs explicit product justification; none clears it now.
- **Preserve existing guards in every new path**: installation-id match on webhooks, claimed-installation anti-spoof, HMAC verify, 40-hex SHA validation, token-never-in-URL + `redactSecrets`, ephemeral checkouts with quota + `finally` cleanup, warn-never-throw Check posting (a GitHub outage must not fail assessments), fork-PR caution (Checks API returns empty `pull_requests` for fork pushes — design for it; never execute untrusted code beyond the current clone+static-scan containment, no workflow execution from PR content).
- **`check_run.rerequested` handler** must re-verify installation binding and rate-limit per project (reuse `webhook:<projectId>` bucket) — re-request is a free job trigger otherwise.
- **Annotation/comment content**: finding summaries may quote source snippets — route through the same redaction as git error output; never include tokens, and keep AI-generated text labeled advisory.
- **Logs**: Check summaries and job evidence must not echo SHAs beyond short refs where unnecessary, and never tokens (already enforced via `redactCloneUrl`; extend to new summary builders).

---

## 9. Prioritization — Now / Next / Explore / Avoid

### Now (fits current product + architecture, no new permissions)

1. **Rich Check lifecycle + `details_url`** — in-progress on claim, completed with severity breakdown, crash-vs-verdict distinction, deep link to finding. Smallest trust upgrade; unblocks everything below.
2. **New-vs-fixed delta (V1)** — fingerprint + baseline-vs-preview comparison, counts and finding-list delta in the Check summary. The single highest-leverage change.
3. **Check annotations (V1: new deterministic source findings on changed lines, capped)** — grounds the verdict in code with zero notification noise.
4. **Upserted PR summary comment** — one marker-keyed comment, updated per push, delta + links. Catches developers who never open the Checks tab.
5. **`check_run.rerequested` → re-enqueue** — expected self-serve behavior; tiny.

### Next (meaningful value, needs infra or validation)

6. **Policy-gated conclusions** — `failure` only for new deterministic high-confidence source findings; `neutral` for heuristic/unable-to-verify-only; per-project threshold config. Requires delta precision data from Now-items first.
7. **Scoped PR scan for speed** — PR-files-derived scope set for the fast path; full scan remains the verdict source until scoped-verdict parity is proven. Builds on existing `scanChangedFiles`/`scopedFileSet`.
8. **Repo intelligence + CODEOWNERS display** — connect-time + drift detection; owner names in Check/PR summaries. Cheap reads, real config-value.
9. **Narrow inline review comments** — only if annotation CTR/acknowledgement data shows criticals are missed; capped, updated in place, never for pre-existing debt.

### Explore (validate before building)

10. **One-way grouped issue export (opt-in)** — only if user interviews show GitHub-triage teams blocked without it; one-way, grouped, never state-back.
11. **ComplyLoop GitHub Action** — only if a segment demonstrably can't install the App; otherwise it splits the execution model for reach alone.
12. **Explicit pinned baselines** (per-release/per-branch) — only if implicit default-branch baseline proves insufficient for monorepo/release-branch users.

### Avoid

- **Per-finding issue sync with auto-close** — duplicates the finding lifecycle in a weaker system; two sources of truth; auto-close races. (Competitor pattern with known noise complaints.)
- **SARIF upload to code scanning** — wrong surface for RGAA evidence; `security-events` write for visibility ComplyLoop already owns in Checks + dashboard.
- **Consuming external CI results as evidence** — provenance can't meet the deterministic-evidence bar; presence-awareness suffices.
- **Per-commit/branch-push scans, auto-review-requests, merge-blocking on heuristic/AI signals** — cost, surprise, or unsoundness respectively.

---

## 10. Recommended MVP sequences

```text
MVP-1 "Legible check" (1–2 wks): Now-1 + Now-5
  claim→in_progress … completed w/ breakdown + details_url … rerequest works
MVP-2 "Trustworthy delta" (2–4 wks on top): Now-2 + Now-3
  +fingerprint … +2 new / −5 resolved … annotations on changed lines
MVP-3 "Unmissable + safe gate" (after precision data): Now-4 + Next-6
  +upserted comment … policy conclusions (narrow failure set) … ruleset docs
Then Next-7/8/9 in demand order; Explore-10/11/12 only on validation.
```

Each MVP is independently shippable and leaves the product strictly better if the next is never built.

---

## 11. Detailed TODO

```text
TODO — GitHub Product Opportunities
```

### [GH-1] Rich Check lifecycle + details_url

### Why

PRs show a bare completed count with no progress, no severity split, no link into ComplyLoop. Developers can't tell scanning from verdict.

### What

- `queued` Check on webhook-manual enqueue (fire-and-forget, warn-never-throw); `in_progress` on claim (`claimNextAssessmentJob` site); `completed` with current summary + `details_url` → assessment/finding page.
- Distinguish crash (`assessment failed to run — not a verdict`, current failure template) from verdict; keep `postFailureCheckRunForJob` terminal-only semantics.
- Include `started_at/completed_at`, `external_id` = job id.

### GitHub capability

Checks create+update (`POST/PATCH /repos/{o}/{r}/check-runs`), `details_url`, `external_id`. Docs: `en/rest/checks/runs`, `en/rest/guides/using-the-rest-api-to-interact-with-checks`.

### Permission

None new (Checks W have).

### UX

Checks tab shows live progress; completed run links "View in ComplyLoop"; crash runs read as infra failure, never compliance failure.

### Architecture

- `src/server/github/github-checks.ts` (+ `github-connector.ts` facade): lifecycle params, details URL builder.
- `src/server/assessment/assessment-jobs.ts` (claim site) + `assessment-worker.ts` (progress/completion sites).
- Tests: extend `github-checks.test.ts`, worker tests; e2e `MockGitHub` check-runs fixture.

### Risks

Extra API calls on hot path — keep warn-never-throw; stale in-progress on crash → reconcile via existing lease/fail paths. Fork pushes yield empty `pull_requests` — still post by SHA.

### Dependencies

None.

### Validation

Every PR shows queued→in_progress→completed; details_url CTR > 0; zero assessment failures caused by Checks errors.

### Priority

**Now**

---

### [GH-2] New-vs-fixed finding delta (baseline = latest authoritative assessment)

### Why

Absolute counts punish small PRs for legacy debt; developers learn to ignore the check. SonarQube/Semgrep both treat new-code-only as the bar.

### What

- V1: stable finding fingerprint `checkId + normalized filePath + anchor(line/selector-hash)` computed at persist; preview run classifies vs latest authoritative assessment: `new | persisted | resolved`; Check summary shows `+N new · −M resolved · net Δ · no new critical ✓/✗` + finding links. Renames reported as new+resolved pair with a note.
- V2: line-anchored II (annotations), per-file grouping, resolved-list with verify links post-merge.

### GitHub capability

PR files (`GET …/pulls/{n}/files`) / compare (`GET …/compare/{base}...{head}`, `previous_filename` for renames) under Contents R. Docs: `en/rest/pulls/pulls`, `en/rest/commits`.

### Permission

None new.

### UX

The delta block in Check summary + PR comment; deterministic wording ("new deterministic finding" vs "heuristic — advisory").

### Architecture

- New: fingerprint fn in `packages/analysis-core` (pure) + persisted fingerprint column/map on findings (migration — ask-first per AGENTS.md: `drizzle/` + `contract/`).
- `src/server/assessment/assessment*.ts`: preview-vs-baseline diff step (persist nothing for previews — invariant preserved).
- `github-checks.ts`: delta summary renderer.

### Risks

Fingerprint instability (line shifts, refactors) → misclassified new/resolved; heuristic findings inflate "new". Mitigate: anchor on selector+checkId not raw line; V1 counts only deterministic source findings toward the headline; measure precision before gating.

### Dependencies

GH-1 (summary surface). No schema change beyond fingerprint.

### Validation

On a labeled PR set: new-finding precision/recall vs human audit; rename handling spot-checked; zero previews persisting state (existing invariant test).

### Priority

**Now** (V1). V2 after precision data.

---

### [GH-3] Check annotations on changed lines

### Why

Counts + links still require leaving the diff. Annotations put deterministic findings where the fix happens.

### What

V1: annotate **new deterministic source findings on changed lines only**, cap N (e.g. 10–20, overflow summarized), `warning` for violations/`notice` for warnings, `raw_details` = requirement + fix hint + ComplyLoop link. Batch ≤50/req via update-append. No annotations for pre-existing, heuristic-only, or runtime-only findings in V1.

### GitHub capability

Check run `output.annotations` (path/start_line/end_line, same-line columns). Docs: `en/rest/checks/runs`.

### Permission

None new.

### UX

Files-changed shows inline findings; overflow line points to the full run; no threads, no notifications.

### Architecture

`github-checks.ts` annotation builder (finding location → path/line mapping, changed-line filter from PR files); worker preview path; tests for mapping + cap + overflow.

### Risks

Line-mapping drift between scan ref and push; annotation spam on large PRs (cap + changed-lines-only mitigates).

### Dependencies

GH-2 (new-vs-changed classification).

### Validation

Annotation precision on changed lines; developer fix-rate on annotated vs non-annotated findings.

### Priority

**Now** (capped V1).

---

### [GH-4] Upserted PR summary comment (single, marker-keyed)

### Why

A share of developers never opens the Checks tab; the timeline needs one stable record per PR.

### What

One `<!-- complyloop:summary -->` issue-comment per PR: created on first preview completion, `PATCH`ed on later pushes (find-by-marker via list comments); content = delta block + severity + top new findings + links. Never posts a second comment; deletes nothing; skips when no installation token (warn-never-throw).

### GitHub capability

Issue comments create+update (`POST/PATCH /repos/{o}/{r}/issues/{n}/comments`). Secondary rate limits apply — one comment per push max, coalesced with job coalescing.

### Permission

None new (PR W have).

### UX

Timeline shows a current summary, not N stale bot comments. Edits are quiet (no re-notify storms).

### Architecture

New `src/server/github/github-pr-comment.ts` (marker find/upsert) + worker preview hook; reuse Check summary renderer.

### Risks

Comment-update races on rapid pushes (serialize per PR job, last-wins like `supersededRefs`); marker collisions (namespaced marker).

### Dependencies

GH-2 (delta content).

### Validation

Exactly ≤1 ComplyLoop comment per PR in e2e + prod sample; edit path covered in tests.

### Priority

**Now** (after GH-2; or with GH-1 if delta slips, posting counts-only interim).

---

### [GH-5] check_run.rerequested → re-enqueue

### Why

Stale/red checks with no retry path generate support load and "just push an empty commit" behavior.

### What

Subscribe `check_run` webhook; on `rerequested` for our check name: verify installation binding, rate-limit (`webhook:<projectId>` bucket), enqueue preview job for that SHA (dedupe by idempotency on delivery id). Ignore other apps' runs.

### GitHub capability

`check_run.rerequested` event (auto-delivered with Checks W). Docs: `en/webhooks/webhook-events-and-payloads`.

### Permission

None new.

### UX

"Re-run" button on the Check just works.

### Architecture

`webhook.ts` (`isHandledRerequest` + enqueue), route (already generic), tests mirroring push/PR paths.

### Risks

Free-job-trigger abuse → rate limit + installation check + coalescing (existing machinery).

### Dependencies

GH-1.

### Validation

Rerequest e2e: delivery → queued job → fresh Check; other-app runs ignored.

### Priority

**Now**

---

### [GH-6] Policy-gated conclusions (narrow failure set)

### Why

A check that fails on heuristic noise gets disabled; a check that never fails gets ignored. The gate must encode ComplyLoop's deterministic authority.

### What

- `failure` **iff** new deterministic high-confidence source findings on changed lines (standard-authority, configurable severities, default: critical/high only).
- `neutral` when only heuristic/`unable_to_verify`/runtime-absent signals exist, with explicit "advisory, not a verdict" text.
- Per-project policy (thresholds, fail-on severities) + docs for required-check/Ruleset wiring. No merge-blocking code — GitHub-side configuration only.

### GitHub capability

Check `conclusion` enum. Docs: `en/rest/checks/runs`.

### Permission

None new.

### UX

Green/neutral/red means exactly what it says; the summary always explains which class drove the conclusion.

### Architecture

Policy module (pure, tested) in `src/server/assessment/` or `src/core/` (note: `finding-act.ts` must not be imported server-side — new file); worker conclusion site; project settings extension (migration).

### Risks

Over-blocking (product risk H) — ship advisory-neutral default, require explicit opt-in to failure; measure false-positive rate first. Under-blocking (confusion) — wording discipline.

### Dependencies

GH-2 precision data; product decision on defaults (see §12 Q1).

### Validation

False-positive review on blocking set; % of PRs failing; bypass/disable rate; support tickets.

### Priority

**Next**

---

### [GH-7] Scoped PR scan for speed (verdict stays full until parity)

### Why

Full clone+scan per `synchronize` is slow; fast feedback is the difference between fixed-in-PR and fixed-never.

### What

PR-files-derived scope set → `scanChangedFiles` fast path for the _annotation/summary_ pass; retain full preview scan for the verdict until scoped/full agreement is measured. Surface `scanMode` in Check text honestly ("scoped preview — full verdict follows" vs "full").

### GitHub capability

PR files/compare (have-permission reads).

### Permission

None new.

### UX

Faster first signal; no verdict-quality regression because the verdict doesn't change until parity is proven.

### Architecture

`assessment.ts` scoped path (exists) + worker preview orchestration + `assessment_snapshots` reuse; perf instrumentation via existing stage timings.

### Risks

Scoped/full divergence (cross-file checks) — the existing `hasCrossFileChecks → full scan` guard already handles the known case; expand the guard list with data.

### Dependencies

GH-2/GH-3.

### Validation

P50/P95 preview latency before/after; scoped-vs-full agreement rate on a PR corpus.

### Priority

**Next**

---

### [GH-8] Repository intelligence + CODEOWNERS display

### Why

Connect-time config is manual; ComplyLoop can't answer "do you overlap my axe CI?" or "who owns this file?".

### What

Read-only, current-permission crawl at connect + weekly drift: framework/deps signals, a11y-tooling presence (`axe-core`, `eslint-plugin-jsx-a11y`, Lighthouse/axe workflows via `contents` listing), `CODEOWNERS` parse, default-branch verification. Surfaces: connect-panel suggestions (preset, runtime-URL hint), owner names in Check/PR summaries. No auto-assign, no review requests.

### GitHub capability

Contents read (`GET …/contents/{path}`), PR read for context. Docs: `en/rest/repos/contents`.

### Permission

None new. (Actions-_run_ ingestion would need Actions R — explicitly out of scope.)

### UX

"Detected Next.js 16 + axe in CI + CODEOWNERS owners for 3 finding files" as glass-box config help, not magic.

### Architecture

New `src/server/github/repo-intel.ts` (pure parsers + thin API client) + connect action hook + small project-metadata columns (migration, ask-first).

### Risks

Large/monorepo enumeration cost — cap paths, cache, drift-only refresh. CODEOWNERS parse edge cases (3 MB cap, invalid lines skipped — mirror GitHub semantics).

### Dependencies

None.

### Validation

Detection accuracy on a repo sample; connect-completion rate; config-accept rate.

### Priority

**Next**

---

### [GH-9] Narrow inline review comments (conditional)

### Why

If data shows annotated criticals are still missed, a louder signal exists — but it must stay rare.

### What

_Only_ new critical deterministic source findings, cap ~3 per PR, update-in-place (PATCH by fingerprint-keyed lookup, DELETE when resolved), no pre-existing, no heuristic. Behind a project flag defaulting off; ship only if GH-3 annotation data justifies it.

### GitHub capability

Review comments create/update/delete. Docs: `en/rest/pulls/comments`.

### Permission

None new.

### UX

Rare, precise, resolvable threads — or the feature stays off.

### Architecture

New review-comment module + fingerprint→comment-id map (table or evidence detail — prefer table, ask-first migration).

### Risks

Noise/secondary rate limits; stale threads on re-push (resolve/outdate discipline required).

### Dependencies

GH-2 + GH-3 data.

### Validation

A/B or before/after: critical fix-rate, comment-resolution rate, complaints.

### Priority

**Next** (conditional)

---

### [GH-10] One-way grouped issue export (opt-in, Explore)

### Why / What

Some teams triage exclusively in GitHub Issues. Offer manual, one-way, grouped-by-rule export with labels/severity/requirement/evidence link. No sync-back, no auto-close (ComplyLoop stays the state authority; GitHub issue closure never resolves a finding).

### GitHub capability

Issues create/update. Permission: **Issues R/W (new)** — the cost center of this proposal.

### UX

Explicit "Export to GitHub Issues" action per view/group; export receipt in evidence.

### Architecture

Export job + idempotency map; new permission in App registration + `.env.example`/`README` updates; permission-justification copy for App listing review.

### Risks

Scope broadening for narrow value; duplicate-triage confusion; auto-close races (avoided by one-way design).

### Dependencies

Validation interviews (see §12 Q4).

### Validation

Opt-in adoption + triage-completion vs dashboard-only cohort.

### Priority

**Explore**

---

### [GH-11] ComplyLoop GitHub Action (Explore)

### Why / What

Serve repos that can't install the App (procurement, GHES without App approval) with a `complyloop.yml` (`pull_request` trigger, changed-files fast path, SARIF + summary outputs, `fail-on` threshold mirroring ScanAccess/a11yscout shape).

### GitHub capability

Actions distribution; SARIF upload needs `security-events: write`.

### Permission

n/a (workflow token model).

### UX

CI-owned scanning; results in Checks + optional SARIF.

### Architecture

New action repo/package, auth story (API key vs installation), duplicate-run prevention with App path, fork-PR secret handling.

### Risks

Second execution model to maintain; secret/fork pitfalls; verdict-authority split across runners.

### Dependencies

Segment validation (see §12 Q5).

### Validation

Design-partner demand; install-rate where App is blocked.

### Priority

**Explore**

---

### [GH-12] Explicit pinned baselines (Explore)

### Why / What

If release-branch/monorepo users outgrow the implicit default-branch baseline: named baselines (assessment id + policy), branch-scoped comparison, baseline lifecycle UI.

### GitHub capability

None new (branch metadata reads).

### Architecture

Baseline entity + comparison selector (migration, ask-first: `drizzle/` + `contract/` + `src/core/` kernel).

### Risks

Conceptual weight for an edge segment; finding-identity demands rise (rename/move must be good, not just noted).

### Dependencies

GH-2 at scale; segment evidence.

### Validation

Pilot with 2–3 release-branch teams.

### Priority

**Explore**

---

### [GH-13] Do-not-build list (Avoid — recorded so it stays decided)

- Per-finding issue sync w/ auto-close; SARIF-as-primary-surface; external-CI-as-evidence; per-commit scans; auto-review-requests; merge-blocking on heuristic/AI/unable_to_verify. Rationale per item in §9-Avoid. Revisit only with new evidence, not new enthusiasm.

---

## 12. Open questions requiring product decisions

1. **Gate defaults**: neutral-advisory default with opt-in narrow failure (recommended) vs failure-by-default? Who can toggle policy (admin-only?) and does a project settings migration precede GH-6?
2. **Bot noise budget**: annotations always on vs opt-in; review comments default off (recommended)? Per-org kill-switch?
3. **Conclusion vocabulary**: do we use `neutral` for advisory (recommended) or `success`-with-text? `neutral` is honest but some teams treat non-success as red — validate with 2–3 design partners.
4. **Issues export**: is any design partner actually blocked without GitHub Issues triage, or is this hypothetical? Name them before granting Issues W.
5. **Action vs App**: is there a real segment that cannot install the App? If not, GH-11 stays parked.
6. **Finding fingerprint stability bar**: what precision on new-vs-resolved justifies V2 annotations-as-gate-input? Pre-commit a number (e.g. ≥95% on deterministic source findings) before GH-6 ships.
7. **Monorepo/release branches**: does the implicit default-branch baseline cover pilot users, or do we need GH-12 sooner? Ask during GH-8 drift interviews.
8. **Evidence linking depth**: `details_url` → assessment page (V1) vs per-finding deep links (V2)? Per-finding links multiply URL-building surface — confirm router readiness during GH-1.

---

_Goal restated: the smallest set is **GH-1 → GH-2 → GH-3 → GH-4 → GH-5**, all permission-free, making the PR check legible, delta-trustworthy, grounded, unmissable, and re-runnable — before any gate, issue, or Action discussion._

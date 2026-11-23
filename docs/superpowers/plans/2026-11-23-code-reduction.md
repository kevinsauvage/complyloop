# Code reduction review — 2026-11-23

> **Status: proposal, needs approval.** Nothing below is applied. Built from
> the code only (graft map, skeletons, targeted reads), not from the existing
> docs. Line counts are measured; savings are estimates.

## 1. Where the code is

61k source lines, 52k test lines (`*.test.*`, `test-fixtures`).

| Area                              | Lines | Note                                                   |
| --------------------------------- | ----: | ------------------------------------------------------ |
| `src/app/(app)` (pages, UI)       | 8,869 | Product UI                                             |
| `analysis-core/src/runtime`       | 8,533 | Playwright audit: axe, html-validate, 21 custom checks |
| `src/server/assessment`           | 5,565 | Scan, reconcile, job queue, verify                     |
| `analysis-core/src/checks`        | 3,932 | AST heuristics (TypeScript compiler API)               |
| `packages/db/src/repo`            | 3,344 | Drizzle queries                                        |
| `analysis-core/src/catalog`       | 2,948 | RGAA data (`controls.ts` 1.8k): content, not a target  |
| `src/server/workspace`, `actions` | 5,825 | Server layer                                           |
| `src/server/github`, `reporting`  | 4,084 | GitHub integration, reports                            |
| Agent docs (md + rules)           | 4,012 | `architecture.md` alone is 677 lines                   |

Deep-read: assessment queue and snapshots, GitHub token and fix-branch code,
reporting, CSS color and sitemap parsers, URL safety, filter params, proxy,
custom-check registry. Skimmed only: the 21 runtime custom checks and the AST
check families (each checks an RGAA criterion axe or jsx-a11y does not cover;
judging each needs a domain pass).

## 2. Replace with a package or a platform feature

| #   | Today                                                                                                                                                                                                                                                | Replace with                                                                                                                                                                                        | Est. saving                   | Risk                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------- |
| P1  | **Postgres job queue built by hand**: enqueue, idempotency, claim, lease, renew, expiry recovery, cancel, stages, retries (`assessment-jobs`, `assessment-job-lease`, `repo/assessment-jobs`, part of `assessment-worker`/`scheduler`): ≈1,750 lines | [`pg-boss`](https://github.com/timgit/pg-boss): Postgres queue with singleton keys, expiry, retries, cancel, archive. Its `fromDrizzle` adapter runs on the existing Drizzle/postgres.js connection | −800 to −1,000 lines, 1 table | **High**: core pipeline. Spike first (one job kind), then migrate     |
| P2  | **Fix-branch Git Data plumbing** (`fix-branch.ts` 406): read base, blobs, tree, keep executable bit, commit, ref, PR                                                                                                                                 | [`octokit-commit-multiple-files`](https://github.com/mheap/octokit-commit-multiple-files) (per-file mode supported) + `pulls.create`                                                                | ≈ −200                        | Medium: PR creation path; existing tests cover it                     |
| P3  | **Sitemap XML parser** (`runtime/sitemap.ts` 237): own entity decoding, comment stripping, `<loc>` scanner                                                                                                                                           | `fast-xml-parser` (keep the size and URL bounds)                                                                                                                                                    | ≈ −100                        | Low                                                                   |
| P4  | **CSS color parser** (`runtime/css-color.ts` 218): rgb/lab/oklab → sRGB math, serialized into the page                                                                                                                                               | No dependency: in the page, paint the color on a 1×1 canvas and read the pixel; Chromium does every conversion (`color-mix`, `lab`, `oklch` included)                                               | ≈ −190                        | Low–medium: check alpha precision against the existing contrast tests |
| P5  | **File-hash snapshots** (`monitor.ts` hashes every source file each run, `assessment_snapshots` table, `hashesUnchanged`, retention special case) to find changed files                                                                              | Git already knows: store the scanned commit, ask GitHub `compareCommits(previous, head)` for changed paths; full scan when no previous commit or more than 300 files                                | ≈ −200 lines, −1 table        | Medium: migration (ask-first); quota counting stays                   |

## 3. Remove or merge

| #   | Today                                                                                                             | Proposal                                                                                                                                                          | Est. saving        | Needs                            |
| --- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------- |
| R1  | **Four report renderers**: audit + engineering views × Markdown + HTML (`report-markdown` 274, `report-html` 666) | Keep one format per view: HTML for the audit report (printable to PDF), Markdown for the engineering handoff                                                      | ≈ −250             | Product decision                 |
| R2  | **HTML report as string templates** with a hand-written `escapeHtml` (468-line primitives, 360 of them CSS)       | Render with `react-dom/server` `renderToStaticMarkup` (already a dependency): escaping by default, no manual escaping to forget                                   | Size-neutral       | Do with R1; safety, not size     |
| R3  | **Two AES-GCM implementations** (`github-tokens.ts` with `sha256(AUTH_SECRET)`, `ai/secret-box.ts`)               | One sealing module with a per-purpose key                                                                                                                         | ≈ −60              | Data migration for GitHub tokens |
| R4  | **Coverage gate at 94 % lines / 80 % branches**: tests are almost as large as the code (52k vs 61k)               | Lower to ≈80 % lines; keep integration and contract tests, stop writing tests for wiring and copy                                                                 | Slows growth       | Quality decision                 |
| R5  | **Agent docs** (4k lines) restate code and drift (the BYOK plan was wrong within two days)                        | Delete superseded plans (`2026-10-11-…-multi-domain-direction`, `2026-11-21-byok-ai-keys`); cut `architecture.md` to invariants and decisions graft cannot derive | ≈ −1,200 doc lines | Your call on what to keep        |

## 4. Checked and kept

- **Runtime custom checks** (21): each targets a criterion axe does not test
  (non-text contrast, reflow, text spacing, reduced motion, focus visibility,
  AAA target size…). Domain value, not a reinvented wheel.
- **URL safety**: already delegates classification to `ssrf-guard`; the rest
  is DNS-rebinding and port policy.
- **GitHub user tokens in the DB with a locked refresh**: GitHub rotates
  refresh tokens, so refreshing from the Auth.js cookie would race between
  parallel requests. The lock is justified (merge the crypto only, R3).
- **Filter params** (540): `nuqs` would save ≈100 lines for a new dependency
  and client wiring. Not worth it.
- **Proxy, rate limits, e2e harness** (85 lines in production code): small
  and direct.
- **Two parsers per file** (TypeScript compiler API for the AST checks,
  `@typescript-eslint/parser` for jsx-a11y): real duplication, but porting 3.9k
  lines of checks to ESLint rules is a rewrite. Revisit only if scan time
  matters.

## 5. Order if approved

1. P3, P4, R5: low risk, no product decision. Gate.
2. P5 (migration), P2, R3. Gate + DB tests + independent review.
3. R1 + R2 after your format decision.
4. P1: a spike on one job kind behind the existing interface, then decide.
5. R4 whenever you decide the threshold.

Total if all applied: roughly −2,000 to −2,300 source lines, −2 tables, the
matching tests, and ≈1,200 fewer doc lines; P1 is half of it.

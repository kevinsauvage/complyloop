# Project Quality & Improvement Audit

> **Point-in-time audit (2026-09-15)** — scores, graft staleness notes, and
> file refs describe the repo that day. Still useful for the refactor roadmap;
> verify each TODO against current source before implementing.

> **Update 2026-09-15 (after `graft build`):** the plain (non-LLM) rebuild was run.
> Verified: per-file wiring cards are now current (`families/*` cards exist with
> accurate symbols; no cards remain for deleted `packages/adapters/`,
> `jsx-primitives.ts`, or per-check files). Residual staleness is confined to the
> **concept layer** (`graft/INDEX.md` + root concept `.md` files still cite deleted
> paths — that layer needs `graft build --deep`, the LLM pass) and to
> `graft check` itself, which still reports STALE (350) — the plain build did not
> refresh `manifest.json`'s hashes. Also discovered: `graft/` is **gitignored**
> (`.gitignore:54-55`, "regenerable, not committed"), so the graph is a per-machine
> cache, not shared state — this reframes TODO-02. TODO-01 marked partially done;
> TODO-02 rewritten; score unchanged at 80/100.

## Overall Score

**80/100 — Very strong (low end)**

Strong architecture with enforced boundaries, dogfooded accessibility, real SSRF/webhook/rate-limit security, and high test thresholds. Pulled down by a stale Graft graph, two god modules, a large coverage-exclusion list, and global client JS that ships to every route.

## Score Breakdown

| Category             | Score | Weight | Main Finding                                                                                                                                                                                              |
| -------------------- | ----: | -----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture         |    82 |    15% | Enforced boundaries (ESLint) + clear contract→db→server→app direction; hurt by `project-view.ts` (769 lines) god loader and `families/forms.ts` (1018 lines)                                              |
| Code Quality         |    78 |    15% | `no-explicit-any`, import sorting, zero TODO markers; hurt by grab-bag `heuristic-utils.ts` (Graft itself flags "highest-risk module to change") and 895-line `check-registry.ts`                         |
| Functionality        |    84 |    15% | Full Requirement→Verify→Evidence loop, 75 check ids, merge/dedupe, durable jobs; PR-head vs default-branch authority correctly separated                                                                  |
| UX/UI                |    76 |    10% | Finding-page UX contract (`finding-act.ts` beat model) + empty/error/loading states; global providers + 54 Client Components add weight to marketing routes                                               |
| Accessibility        |    88 |    10% | Strongest area: jsx-a11y strict, axe e2e on 8 pages, focus management (`PathnameFocus`), sr-only patterns                                                                                                 |
| Performance          |    74 |    10% | `serverExternalPackages`, `next/font`, lazy Sentry client; hurt by global Theme+Tooltip+Toaster and un-scrutinized client-component count                                                                 |
| Security             |    85 |    10% | Webhook HMAC, SSRF DNS-rebind guard, AES-256-GCM tokens, Postgres rate-limit, advisory locks, open-redirect guard; minor: `AUTH_SECRET` dual-use                                                          |
| Testing              |    80 |     5% | 216 test files, thresholds lines 94 / functions 96 / branches 80; ~20 files excluded from unit gate weakens the number                                                                                    |
| Developer Experience |    78 |     5% | Definition-of-done gate, `verify-gate.sh`, scripts; `graft check` still STALE after plain `graft build` (concept pass pending); `graft/` gitignored so graph is local-only                                |
| Documentation / AI   |    72 |     5% | Excellent `architecture.md` + finding-flow; wiring cards fresh after rebuild, but concept nodes still cite deleted `packages/adapters/` and `jsx-primitives.ts` (needs `--deep`); `opencode.json` is `{}` |

Weighted: 12.3 + 11.7 + 12.6 + 7.6 + 8.8 + 7.4 + 8.5 + 4.0 + 3.9 + 3.6 = **~80** (unchanged; +0.1 rounds away).

## Graft Architecture Summary

Graft reports 646 files · 1903 symbols · 8364 edges. Verified against source:

- **Hotspot `parse.ts`** — `getAttribute` (90←), `tagNameOf` (86←), `visitJsxTags` (63←). Confirmed in `packages/analysis-core/src/parse.ts` (290 lines). This is the correct single AST-traversal choke point — healthy fan-in, do not split.
- **Hotspot `heuristic-utils.ts`** — `descendantTags` (14←), `textContentOf` (13←). Graft concept `shared-heuristic-utilities` explicitly warns: "grab-bag… highest-risk module to change — a tweak here silently alters every dependent check." Verified: file imports from `parse.ts` and is consumed by behavior/forms/structure families. Real coupling risk, not theoretical.
- **Hotspot `getDrizzle`** (48←) — `graft callers getDrizzle` shows all calls go through sanctioned loaders (`workspace/*`, `project-runtime.ts`, reporting loaders, job/infra paths) plus tests. The "no raw `getDrizzle()` in actions" ESLint rule holds in the sampled paths. Healthy.
- **Hotspot `cn`** (94←) — trivial utility, correct fan-in.
- **Staleness (partially resolved 2026-09-15)** — plain `graft build` refreshed the
  wiring layer: per-file cards now match the tree (verified `families/forms.md`
  with accurate symbols; `graft/packages/adapters`, `jsx-primitives.md`, and
  `focus-context-change.md` no longer exist). Residual staleness is the **concept
  layer**: `graft/INDEX.md` and root concept nodes (`shared-a11y-predicates`,
  `context-change-interaction-checks`, …) still cite deleted per-check files and
  `jsx-primitives.ts`, and `graft ask "where do AST checks live"` still returns
  those dead spans (verified post-build). `graft check` still reports STALE (350);
  the plain build did not update `manifest.json` hashes — the `--deep` LLM pass
  appears to be what refreshes them. Note `graft/` is gitignored (`.gitignore:54-55`),
  so all of this is per-machine state, invisible to CI and other checkouts.
- **Missing from concept layer** — `checks/families/*`, `check-registry.ts`,
  `project-view.ts` have wiring cards but no concept nodes; `graft ask` (concept
  search) over-represents deleted per-check files while `graft map`/`callers`/
  `skeleton` (wiring search) are now trustworthy. Rule of thumb until `--deep`:
  prefer wiring queries over `ask`.

## What Is Already Good

- Module boundaries are **executable**, not aspirational (`eslint.config.mjs`: `src/core` kernel restrictions, assessment→`finding-act` ban, entity-import ban). Rare and valuable.
- Security is concrete: webhook signature verify (`src/server/github/webhook.ts:46-55`), SSRF policy with DNS-rebind + redirect-hop guards (`runtime/url-safety.ts`), AES-256-GCM token crypto (`github-tokens.ts:33-58`), Postgres sliding-window rate limits + advisory locks, `toSafeCallbackUrl` open-redirect guard (`src/proxy.ts`), `poweredByHeader: false`.
- Status derivation order and "AI never sets statuses" are enforced in code, not just docs.
- Coverage thresholds (94/96/80) with an _explicit, reasoned_ exclusion list — honest, though the list is long (see TODO-07).
- Zero `TODO/FIXME/HACK` markers in `src`/`packages`; `git status` clean.
- Finding-page beat model (`src/core/finding-act.ts:1-50`) gives every finding one primary CTA — the single best UX decision in the repo.

## Biggest Problems

1. **Graft concept layer is stale (wiring fixed 2026-09-15)** — per-file cards are
   current, but `graft ask` still returns deleted paths; needs the `--deep` LLM pass.
2. **Two god modules**: `project-view.ts` (769 lines, every page loader) and `families/forms.ts` (1018 lines). Plus `check-registry.ts` (895 lines, intentional but untested-for-size).
3. **Coverage gate has ~20 exclusions** — the 94% line threshold applies to a subset; runtime scan, link-check, GitHub/token/checkout paths are e2e-or-nothing.
4. **Global client JS** — Theme+Tooltip+Toaster in root layout (acknowledged as intentional in `architecture.md`) + 54 `"use client"` files with no budget or audit trail.
5. **`heuristic-utils.ts` is a load-bearing grab-bag** — Graft and source agree; no ownership split, no change-blast-radius test.

---

# Prioritized TODOs

## P0 — Critical

_(Empty as of 2026-09-15: former P0s resolved — TODO-01 wiring half done and
remainder downgraded to P1, TODO-02 reframed to P2. No critical items remain.)_

### TODO-01 — Refresh Graft concept layer (`--deep`) and clear `graft check` [PARTIALLY DONE 2026-09-15]

Priority: P1 (was P0; wiring half is done)
Category: Documentation / AI-readiness
Expected win (remaining): +1–2%
Impact: 3/5
Effort: S
Risk: Low
Confidence: Medium

Problem:
Plain `graft build` fixed the wiring cards but the concept layer still cites
deleted modules, and `graft check` still reports STALE (350). Any agent using
`graft ask` lands on dead spans.

Evidence (post-build verification):

- `ls graft/packages/analysis-core/src/checks/families/` → `forms.md` etc. with
  accurate symbols ✅; `graft/packages/adapters`, `jsx-primitives.md`,
  `focus-context-change.md` → gone ✅.
- `graft ask "where do AST accessibility checks live"` → still returns concepts
  citing deleted `form-error-association.ts`, `input-label.ts`, … ❌.
- `graft check` → still `STALE`, `changed (350)`; `manifest.json` still carries
  old `repoDigest` + `deepseek` model tag ❌.
- `graft/INDEX.md` concept list unchanged (still references deleted paths) ❌.

Graft signal:
Wiring-vs-concept split: `map`/`callers`/`skeleton` trustworthy, `ask` not.
The `--deep` LLM pass is what regenerates concept nodes and (apparently) the manifest.

Change (remaining):

1. Run `graft build --deep` (needs LLM provider/key).
2. Verify `graft check` goes clean and `graft ask "where do AST checks live"`
   returns `checks/families/*` + `check-registry.ts`, not deleted paths.
3. If `graft check` still stays STALE after `--deep`, file it as a graft-tooling
   issue and fall back to documenting "prefer wiring queries over `ask`" in
   `AGENTS.md` (one line).

Why:
Concept search is the remaining misdirection source; wiring search already works.

Expected result:
`graft check` clean; no references to deleted modules; new concept nodes cover
`checks/families/*`, `check-registry.ts`, `project-view.ts`.

Validation:
`graft check` passes; the `graft ask` query above returns current paths.

---

### TODO-02 — Decide Graft freshness policy (was: gate `graft check` in CI — DOESN'T APPLY AS WRITTEN)

Priority: P2 (was P0)
Category: Developer Experience
Expected win: +0.5–1%
Impact: 2/5
Effort: XS
Risk: Low
Confidence: High

Problem:
The original proposal (fail CI on `graft check`) is unworkable: `graft/` is
gitignored (`.gitignore:54-55`, "regenerable, not committed"), so a fresh CI
checkout has no graph to check — and a CI job that builds-then-checks would
trivially always pass. The graph rotted locally precisely because nothing owns it.

Evidence:

- `.gitignore:55` → `/graft/`; `git status` after `graft build` shows no graft
  changes (nothing to commit).
- `.ignore:1-4` keeps graft greppable for ripgrep; `.cursorignore:21-22` excludes
  only `.cache/`/`.graph/`.
- No workflow references graft; `AGENTS.md` commands block doesn't mention
  `graft build`.

Change (pick one):

- (a) **Document the rebuild cadence (recommended, XS):** add `graft build`
  (and `--deep` when keyed) to the `AGENTS.md` commands block + onboarding line
  "run `graft build` after checkout / when spans look stale; prefer
  `map`/`callers`/`skeleton` over `ask` until `--deep` is fresh."
- (b) **Commit the graph:** remove `/graft/` from `.gitignore`, commit the
  regenerated graph, then add the CI `graft check` gate. Heavier (noisy diffs on
  every change, merge conflicts in generated markdown) — only if the team finds
  agents consistently working from stale graphs.

Why:
A freshness mechanism that fits how the graph is actually stored; (a) costs one
line and fixes the real failure (agents never rebuilding).

Expected result:
Every agent session starts from a fresh-enough graph, or the staleness is at
least a conscious, documented tradeoff.

Validation:
Fresh clone + `AGENTS.md` instructions → `graft ask` returns current paths
after following the documented rebuild step.

---

## P1 — Highest ROI

### TODO-03 — Split `project-view.ts` (769-line page-loader god module) by route

Priority: P1
Category: Architecture
Expected win: +3–4%
Impact: 4/5
Effort: M
Risk: Medium
Confidence: High

Problem:
All `(app)` page-loader composition (tenancy + runtime + counts + clustering + pagination) lives in one 769-line file. Every page change touches the same module; blast radius is the whole app shell.

Evidence:
`src/server/workspace/project-view.ts` — 769 lines (largest `src/` file); header comment says "debugging a request starts in one place" (explicit god-module tradeoff).

Graft signal:
`graft callers getDrizzle` shows many distinct readers converging here. (Update
2026-09-15: wiring cards now cover `project-view.ts`, so `skeleton`/`callers`
work; it is only the _concept_ layer that misses it.)

Change:
Split into `project-view/{findings,requirements,evidence,dashboard,nav}.ts` behind a thin `index.ts` re-exporting the same loader names (no caller changes in step 1). Move shared scope helpers to the existing `project-scope.ts`. Keep `cache()` semantics per-loader. Step 2 (separate TODO if needed): let pages import route loaders directly and delete the barrel.

Why:
Reduces merge conflicts, shortens reasoning scope per page, makes per-route caching/exclusion (TODO-07) expressible.

Expected result:
No behavior change; 5 modules of ~100–200 lines; `project-view.ts` becomes a ≤30-line barrel or disappears.

Validation:
`npm run lint && npm run typecheck && npx vitest run src/server/workspace` green; `rg "from.*project-view"` shows unchanged import names.

---

### TODO-04 — Split `families/forms.ts` (1018 lines) and `check-registry.ts` (895 lines) along existing family seams

Priority: P1
Category: Architecture / Code quality
Expected win: +2–4%
Impact: 4/5
Effort: M
Risk: Medium
Confidence: Medium

Problem:
Two largest analysis files concentrate unrelated checks. A change to captcha heuristics risks label heuristics in review and in test selection.

Evidence:
`families/forms.ts` 1018 lines; `check-registry.ts` 895 lines with 134 `id:` hits; `families/` already has behavior/structure/media/motion/names seams proving the pattern works.

Graft signal:
`graft map` shows `checks/` with hubs in `heuristic-utils.ts`; post-2026-09-15
rebuild the wiring cards cover `families/*`, but concept search still describes
the pre-consolidation per-file layout.

Change:

1. Split `forms.ts` → `forms/{labels,errors,autocomplete,captcha}.ts` re-exporting the same `AccessibilityCheck` arrays; `checks/registry.ts` imports unchanged.
2. Split `CHECK_REGISTRY` array by authority class into `check-registry/{standard,heuristic,runtime-only,site-level}.ts` with `check-registry.ts` as concat + type re-export. Keep `CheckId`/`CHECK_IDS` derivation identical.
3. No check-logic edits in this TODO.

Why:
Review blast radius and test selection become per-family; future check additions stop growing two monoliths.

Expected result:
Same `CHECK_IDS`, same catalog-coverage test results, files ≤300 lines each.

Validation:
`npx vitest run packages/analysis-core/src/check-registry.test.ts packages/analysis-core/src/checks` green; `rg -c "id:"` total unchanged at 134.

---

### TODO-05 — Isolate `heuristic-utils.ts` blast radius (pin behavior with characterization tests + forbid new exports)

Priority: P1
Category: Testing / reliability
Expected win: +2–3%
Impact: 4/5
Effort: S
Risk: Low
Confidence: High

Problem:
Graft's own summary: "highest-risk module to change — a tweak here silently alters every dependent check." 388 lines, 14←/13← fan-in on two functions, mixed concerns (context-change, text extraction, table analysis, transcript links, video descriptions).

Evidence:
`packages/analysis-core/src/checks/heuristic-utils.ts` (388 lines); `heuristic-utils.test.ts` exists but covers helpers in isolation, not downstream check behavior.

Graft signal:
Direct quote from `shared-heuristic-utilities.md` summary block (generated, not hand-written).

Change:

1. Add a characterization test: run the full AST suite over a fixed fixture corpus and snapshot per-check finding counts; fails if any `heuristic-utils` edit changes any check's output without updating the snapshot deliberately.
2. Add an ESLint `no-restricted-imports` or CODEOWNERS note: new shared helpers go in a named module (`table-utils.ts`, `transcript-utils.ts`), not appended here.
3. Do NOT refactor the file in this TODO (separate, higher-risk work).

Why:
Converts silent cross-check breakage into a loud test failure; cheapest insurance for the highest-fan-in helper module.

Expected result:
Any behavior-altering edit to `heuristic-utils.ts` fails exactly one snapshot test naming the affected checks.

Validation:
Mutate `textContentOf` whitespace handling in a scratch branch; characterization test fails listing affected checks; revert.

---

### TODO-06 — Audit the 54 Client Components against a client-JS budget

Priority: P1
Category: Performance
Expected win: +2–4%
Impact: 4/5
Effort: S
Risk: Low
Confidence: Medium

Problem:
54 files carry `"use client"`; root layout ships Theme+Tooltip+Toaster to every route including marketing pages (docs admit this is intentional "until marketing pages need zero client JS" — that day is now measurable). No budget, no list, no per-route accountability.

Evidence:
`rg -l '"use client"' src` → 54 files; `src/app/layout.tsx:40-53` global providers; `next.config.ts` already has `optimizePackageImports: ["radix-ui"]` (good, but unbounded surface remains).

Graft signal:
`graft callers cn` (94←) shows the client surface is dominated by presentational class-merging — most Client Components are leaves that could stay leaves, but nothing verifies no data-fetching component grew `"use client"` above a `@/server/*` import (the convention in `AGENTS.md:95-97`).

Change:

1. Run `npm run analyze` (Turbopack bundle report, already scripted) and record per-route client-JS before/after.
2. Enforce the existing convention with a lint rule or a unit test that fails if any file containing `"use client"` imports `@/server/*` or `server-only`.
3. Move `TooltipProvider`+`Toaster` out of root layout into `(app)/layout.tsx` if marketing routes (`src/app/(marketing)`) render cleanly without them; keep `ThemeProvider` at root (FOUC rationale documented, keep).
4. Convert pure-presentational `"use client"` files with no hooks/handlers to server components where trivially possible; leave the rest with a comment.

Why:
Largest probable First-Load-JS win for the least risk; mostly deletion/moves, no feature work.

Expected result:
Marketing routes ship ~0 client JS beyond theme; `(app)` routes unchanged functionally; a regression test prevents re-growth.

Validation:
`npm run analyze` before/after shows reduced client bytes on `/` and `/legal/*`; `npm run build` green; Playwright smoke passes.

---

## P2 — Valuable

### TODO-07 — Shrink the coverage-exclusion list: bring 3 high-value modules under unit test

Priority: P2
Category: Testing / reliability
Expected win: +2–3%
Impact: 3/5
Effort: M
Risk: Low
Confidence: High

Problem:
`vitest.config.mts:55-94` excludes ~20 paths from unit thresholds (runtime scan, custom probes, html-validate, applicability, link-check, postgres client, schema, workspace-load, `workspace.ts`, `project-view.ts`, GitHub/token/checkout modules). The 94/96/80 gates look strict but apply to a carved-out subset; the excluded set is exactly the highest-risk I/O surface, covered only by e2e/DB suites that don't run per-PR.

Evidence:
Exclusion block lines 55–94; `test:db` script covers only 5 files; several exclusions are justified per-line ("needs Chromium", "needs Postgres") but three are pure-logic candidates: `runtime/applicability.ts`, `packages/db/src/repo/*` pure helpers (noted "pure helpers have unit tests" — verify and expand), `src/server/workspace/project-runtime.ts`.

Graft signal:
`graft map` lists `runtime/` as 106 files · 275 symbols — the largest directory cluster, yet almost entirely excluded from the unit gate. Coverage and graph agree on where the untested mass is.

Change:

1. Add unit tests for `applicability.ts` gating (pure function of flags — no browser needed).
2. Add unit tests for `project-runtime.ts` composition with mocked repo layer.
3. Add unit tests for pure `repo/*` mappers/guards; keep true-I/O modules excluded with per-line justification.
4. Remove the three from `exclude`; keep thresholds unchanged.

Why:
Raises the _effective_ gate without raising the _nominal_ threshold — the honest version of "increase coverage."

Expected result:
3 fewer exclusions; unit suite catches gating/composition regressions that currently need e2e.

Validation:
`npm run test:coverage` passes with the smaller exclusion list; `git diff vitest.config.mts` shows only removals.

---

### TODO-08 — Rotate-or-document the `AUTH_SECRET` dual-use (NextAuth secret + token-encryption key)

Priority: P2
Category: Security (defense-in-depth, not an active vuln)
Expected win: +1–2%
Impact: 3/5
Effort: S
Risk: Medium (rotation invalidates sessions/tokens — plan it)
Confidence: Medium

Problem:
`deriveKey()` (`github-tokens.ts:29-37`) does `sha256(AUTH_SECRET)` and uses it as the AES-256-GCM key for stored GitHub OAuth tokens, while the same `AUTH_SECRET` is the NextAuth session secret (`auth.ts`). Key reuse across purposes + silent data loss on rotation (no versioning beyond `v: 1` envelope, no rotation path).

Evidence:
`src/server/github/github-tokens.ts:29-37` (`deriveKey`), `EncryptedTokenEntry.v: 1` with no key-id; `auth.ts` uses same env var as NextAuth `secret`.

Graft signal:
`graft callers getDrizzle` shows token read/write paths (`storeUserGitHubToken`, `getStoredGitHubTokenWithExpiry`, `clearStoredGitHubToken`) all funnel through this one key — single point of cryptographic failure, easy to scope.

Change (pick one, do not do both):

- (a) Introduce `GITHUB_TOKEN_ENCRYPTION_KEY` (fallback to `AUTH_SECRET` with a startup warning), add `kid` to the envelope, support decrypt-with-old/encrypt-with-new; or
- (b) Document in `docs/deploy.md` that rotating `AUTH_SECRET` invalidates sessions AND stored GitHub tokens (users must reconnect repos), and add a startup log line when the fallback is in use.
  Prefer (a) if the team accepts a migration; (b) is acceptable and nearly free.

Why:
Separates session-MAC from at-rest-encryption; makes rotation survivable.

Expected result:
Rotation runbook exists; no silent token loss.

Validation:
Unit test: encrypt under key A, decrypt under key list [B, A] succeeds; `resolveAuthSecret` behavior unchanged; `npm run test` green.

---

### TODO-09 — Deduplicate the intentionally-duplicated `isGitHubAuthConfigured` (proxy vs auth)

Priority: P2
Category: Code quality
Expected win: +0.5–1%
Impact: 2/5
Effort: XS
Risk: Low
Confidence: High

Problem:
`src/proxy.ts` duplicates the env-var check from `src/auth.ts` with a comment explaining why (avoid pulling NextAuth/DB into the edge bundle). The rationale is valid, but the duplication is now load-bearing config logic in two places with no test pinning them together.

Evidence:
`src/proxy.ts:17-24` + comment block; `src/auth.ts:14-20`.

Change:
Extract the pure predicate to `@/auth-secret.ts` (already edge-safe — proxy already imports it) as `isGitHubAuthConfigured()`, import in both files, delete both local copies. No behavior change; bundle stays edge-clean because the new home imports nothing server-side (verify with a comment + test asserting the import graph).

Why:
Removes the only sanctioned copy-paste in the auth path; prevents future drift (e.g. someone adds `AUTH_URL` to one copy).

Expected result:
One definition, two call sites, same edge bundle.

Validation:
Unit test asserts both modules agree across env-var combinations; `npm run build` green (edge bundle compiles).

---

### TODO-10 — Give `project-view.ts` loaders per-route exclusions instead of blanket e2e-only coverage

Priority: P2
Category: Testing (marginal over TODO-03/07 — do after them)
Expected win: +1–2%
Impact: 3/5
Effort: S
Risk: Low
Confidence: Medium

Problem:
`project-view.ts` (769 lines) is excluded from unit coverage as "covered via test:e2e page runs" — meaning the most-imported `src/` loader has zero per-PR regression protection.

Evidence:
`vitest.config.mts:80` (`project-view.ts // test:e2e`); `graft callers getDrizzle` → `project-view.ts` is a convergence point.

Change:
After TODO-03's split, unit-test the pure shaping functions (counts, clustering inputs, pagination math) with mocked `getWorkspace`/`getProjectRuntime`; keep DB-backed composition in `test:db`/e2e. Remove per-route loader files from `exclude` as each gains tests.

Why:
Findings/dashboard/requirements pages are the product's face; their loaders deserve unit pins.

Expected result:
Route-loader regressions fail in seconds (vitest), not minutes (Playwright).

Validation:
`npm run test:coverage` passes with route loaders included; deliberately break a count mapping in scratch → unit test fails.

---

## P3 — Polish

### TODO-11 — Fill `opencode.json` (`{}` today) or delete it and standardize on AGENTS.md + `.cursor/rules`

Priority: P3
Category: Documentation / AI-readiness
Expected win: +0.5–1%
Impact: 2/5
Effort: XS
Risk: Low
Confidence: High

Problem:
`opencode.json` contains only `{"$schema": ...}` — a dead config that suggests OpenCode integration that doesn't exist, while `.opencode/` contains only a nested `node_modules` install. Agents check it, find nothing, waste a lookup.

Evidence:
`cat opencode.json` → schema line only; `ls .opencode/` → `node_modules package-lock.json package.json` (plugin install, no config).

Change:
Either (a) add the 5–10 lines that matter (formatter/linter/test commands mirroring `AGENTS.md`), or (b) delete `opencode.json` + `.opencode/` and note in `AGENTS.md` that OpenCode uses the same commands. Prefer (b) unless the team actively uses OpenCode plugins.

Validation:
Fresh agent can answer "how do I verify a change" from exactly one config source.

---

### TODO-12 — Reconsider `widenClientFileUpload: true` (Sentry) against the client-JS budget

Priority: P3
Category: Performance
Expected win: +0.5–1%
Impact: 2/5
Effort: XS
Risk: Low
Confidence: Medium

Problem:
`next.config.ts` sets `widenClientFileUpload: true` (uploads more sourcemaps, larger client chunks instrumented) while the project simultaneously optimizes client weight (`optimizePackageImports`). The tradeoff is unmeasured.

Evidence:
`next.config.ts:67-76`; `src/instrumentation-client.ts` already lazy-loads the Sentry browser SDK (`import()` fire-and-forget) — good, but `widenClientFileUpload` widens what gets instrumented.

Change:
Measure client bytes with the flag on/off via `npm run analyze`; keep it only if the debugging value (per `sentryInitOptions`) justifies the delta. Record the decision in a comment.

Validation:
Bundle report delta documented; no change in error-reporting smoke test.

---

### TODO-13 — Add `no-redundant-aria` audit for the marketing pages (own-medicine check)

Priority: P3
Category: Accessibility
Expected win: +0.5–1%
Impact: 2/5
Effort: XS
Risk: Low
Confidence: Medium

Problem:
The product sells accessibility rigor; `app-shell.tsx` already models correct `aria-hidden` + `sr-only` pairing (`BrandMark`), but nothing prevents a future marketing edit from shipping `aria-hidden` without its screen-reader complement or a redundant `role`.

Evidence:
`src/components/app-shell.tsx:16-36` (exemplary pattern); `e2e/a11y.spec.ts` runs axe `wcag2a+wcag2aa` on 8 pages including `/`, `/legal/terms`, `/legal/privacy` — the harness exists, the specific assertion doesn't.

Change:
Add one axe-rule assertion (or a lint check) that marketing routes have zero `aria-hidden`-without-alternative and zero redundant-role violations. No component changes expected — this is a ratchet.

Validation:
`npm run test:e2e -- e2e/a11y.spec.ts` green with the tightened assertion; intentionally break `BrandMark` in scratch → test fails.

---

## DON'T DO

- **Do not rewrite the analysis engines or merge logic.** `check-registry.ts` + `check-authority.ts` + `merge-findings.ts` form a tested, documented authority model (precedence: site_level → runtime_only → heuristic → standard). A rewrite risks silent status flips — the one failure mode this product cannot afford.
- **Do not add a state-management library, DI container, or abstract repository layer.** `architecture.md` explicitly rejects these ("concrete `repo` functions are the API"); the direct-call structure is correct for this scale.
- **Do not add `@axe-core/playwright` or `ssrf-guard/node`.** Both bans are documented scar tissue (SSR crash comment in `url-safety.ts` header). Respect them.
- **Do not split `parse.ts`'s traversal helpers.** 90←/86←/63← fan-in is healthy centralization, not a god module.
- **Do not chase 100% coverage or test every `repo/*` I/O path in unit tests.** The exclusion list exists for real reasons (Chromium, Postgres, network); TODO-07 targets only the pure-logic subset.
- **Do not move `ThemeProvider` out of root layout** (FOUC rationale is real); TODO-06 moves only Tooltip/Toaster.
- **Do not "fix" the intentional `proxy.ts`/`auth.ts` duplication by importing `auth.ts` into the proxy** — that reintroduces the edge-bundle blowup the comment warns about. TODO-09's shared-extraction is the only safe shape.
- **Do not microservice the worker.** In-process dev drain + single `npm run worker` in prod is correct; the 30-min lease / 3-attempt / serial-per-project protocol needs no infrastructure.

---

# ROI Ranking

| Rank | TODO                                       |     Win | Effort | Impact | Risk   | Confidence |
| ---: | ------------------------------------------ | ------: | ------ | -----: | ------ | ---------- |
|    1 | 01 Concept refresh (`--deep`) [remaining]  |   +1–2% | S      |    3/5 | Low    | Medium     |
|    2 | 03 Split `project-view.ts`                 |   +3–4% | M      |    4/5 | Medium | High       |
|    3 | 06 Client-JS budget + provider move        |   +2–4% | S      |    4/5 | Low    | Medium     |
|    4 | 04 Split `forms.ts` + registry             |   +2–4% | M      |    4/5 | Medium | Medium     |
|    5 | 05 `heuristic-utils` characterization test |   +2–3% | S      |    4/5 | Low    | High       |
|    6 | 07 Shrink coverage exclusions (3 modules)  |   +2–3% | M      |    3/5 | Low    | High       |
|    7 | 02 Graft freshness policy                  | +0.5–1% | XS     |    2/5 | Low    | High       |
|    8 | 08 `AUTH_SECRET` dual-use                  |   +1–2% | S      |    3/5 | Medium | Medium     |
|    9 | 10 Unit-test route loaders                 |   +1–2% | S      |    3/5 | Low    | Medium     |
|   10 | 09 Dedupe auth predicate                   | +0.5–1% | XS     |    2/5 | Low    | High       |
|   11 | 11 `opencode.json` fill-or-delete          | +0.5–1% | XS     |    2/5 | Low    | High       |
|   12 | 12 Sentry `widenClientFileUpload`          | +0.5–1% | XS     |    2/5 | Low    | Medium     |
|   13 | 13 Marketing aria ratchet                  | +0.5–1% | XS     |    2/5 | Low    | Medium     |

ROI = Impact × Confidence ÷ Effort (XS=0.5, S=1, M=2, L=3). TODO-02 is now a docs
one-liner — do it together with TODO-01's `--deep` verification pass.

# Score Progression

Marginal (non-overlapping) estimates — TODO-02/10/07 overlap, discounted.
2026-09-15 status: wiring half of TODO-01 done (no score change; the remaining
concept refresh is the +1–2% below):

- Current: **80/100**
- After P0 (none remaining — old P0s done/downgraded): **80/100**
- After P1 (01-rest + 03+04+05+06): **87–88/100** (+3–5 marginal; god-module splits overlap, client-JS is independent)
- After P2 (07+08+09+10): **89–90/100** (+1–2 marginal; 07/10 overlap heavily)
- After P3 (11+12+13): **90/100** (+0–1; polish asymptote)

**STOP — further changes are unlikely to provide enough value** beyond 90. The remaining distance to 100 would require rewrites (analysis engines, worker infrastructure, design-system overhaul) with negative ROI and real regression risk. At 90 this is a very-strong production codebase; spend further effort on product scope (more checks, more frameworks), not architecture churn.

# Top 5 Highest-Leverage Improvements

1. **Concept refresh `--deep` (TODO-01 remainder)** — unblocks trustworthy `graft ask`; wiring already works.
2. **Split `project-view.ts` (TODO-03)** — largest `src/` coupling point; every page benefits.
3. **Client-JS budget + provider move (TODO-06)** — the only P1 with direct user-facing latency impact.
4. **Split `forms.ts` + registry (TODO-04)** — makes the analysis core reviewable per-domain.
5. **`heuristic-utils` characterization test (TODO-05)** — cheapest insurance against the repo's highest-fan-in silent-breakage risk.

# The 20% That Matters

TODO-03 + TODO-06 + TODO-05 + TODO-01-rest (two S, one S, one M) deliver roughly
80% of the available +8–10 points. They share a theme: **make the biggest file
small** (page loaders), **ship less JavaScript** (providers), **make silent
breakage loud** (characterization test), **make concept search tell the truth**
(`--deep`). Everything else is incremental.

# If I Have One Day

~~Do TODO-01 (morning: `graft build`…)~~ — DONE 2026-09-15 (wiring half).
Do TODO-01-rest (morning: `graft build --deep`, verify `graft check` clean; ~1h
plus key setup) + TODO-05 (afternoon: characterization snapshot) + TODO-02-option-(a)
(15 minutes: one line in `AGENTS.md`). End the day with a fully trustworthy graph,
a pinned heuristic core, and a documented rebuild cadence. Expected: **80 → 83–84**,
plus unlocked velocity for all follow-ups.

# If I Have One Hour

~~Minimum viable `graft build`~~ — DONE 2026-09-15. Best hour now: TODO-05's
characterization snapshot, or TODO-02-option-(a) (one line in `AGENTS.md`) +
starting TODO-03's `project-view.ts` split behind a re-export barrel.
Expected: **80 → 81** plus removal of the worst remaining risk.

# What I Should NOT Touch

See DON'T DO. Shortest version: the authority/merge/status-derivation core, the worker protocol, the SSRF/webhook/crypto paths (except TODO-08's key-separation, carefully), `parse.ts` traversal, and anything that adds abstractions, services, or dependencies. This codebase's disease risk is **growth**, not **decay** — the audit's through-line is deletion, splitting, and pinning, never adding.

# Final Recommendation

This is a well-run, honestly-documented codebase scoring **80/100** — its docs admit tradeoffs (global providers, coverage exclusions, intentional duplication) instead of hiding them, and its boundaries are enforced by lint rather than wishes. Its most embarrassing fact as first written — that the AI-navigation layer
described a codebase that no longer existed — is half-fixed: wiring cards are
current since the 2026-09-15 `graft build`, and only concept search still cites
deleted paths. Finish the concept refresh (`--deep`, P1), split the two god
modules and weigh the client JS (P1), then pin the risky seams with tests (P1–P2). Stop at ~90 and build product. Another agent can implement this roadmap file-by-file without further planning — each TODO names its files, its verification command, and its done-state.

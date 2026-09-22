# TODO — ComplyLoop

Prioritised backlog after a full-repo audit (Sep 2026).

**Legend** — **P0** = critical (security, data loss, trust-breaking, or blocks the core
loop) · **P1** = important, non-blocking.

**Provenance** — items tagged `[verified]` were confirmed in the working tree during
this audit; `[GH-n]` come from [`docs/ai/github-integration-audit.md`](./docs/ai/github-integration-audit.md);
`[cleanup]` from [`docs/ai/over-engineering-audit.md`](./docs/ai/over-engineering-audit.md).

**Baseline at audit time:** `tsc --noEmit` clean · `eslint .` clean · 1755 tests pass
(221 files) · 0 committed secrets · CI covers format/lint/typecheck/coverage/build,
bundle analysis, Postgres integration, and Playwright e2e. The tree is healthy; the
items below are known gaps, not breakage.

---

## P0 — critical

- [x] **P0-1 · Test runner shipped in the production analysis engine** `[verified]`
      **Fixed:** `registerPlaywrightBrowserTeardown` moved to the test-only
      `playwright-test-teardown.ts`; shipped code exposes `closeSharedBrowser()` instead.
      29 test files updated (import source only). No non-test module imports `vitest`.

- [ ] **P0-2 · No stable cross-run finding identity** `[verified]`
      Findings carry `filePath:line`-style locations and are deduped **within a run only**
      (`packages/analysis-core/src/merge-findings.ts:133-179`); nothing persists a stable
      fingerprint. Without it, run N+1 cannot classify `new | persisted | resolved` — the
      prerequisite for every trustworthy pre-merge signal.
      **Fix:** pure fingerprint fn (`checkId + normalized path + anchor(selector/hash)`) in
      analysis-core + a persisted fingerprint column/map. Migration — ask-first per AGENTS.md.

- [ ] **P0-3 · PR Check is a bare count with no lifecycle or link** `[GH-1]`
      `src/server/github/github-checks.ts:71-125` posts a single `completed` run with counts
      and an assessment id: no `in_progress`, no severity breakdown, no `details_url`.
      **Fix:** `queued` on enqueue → `in_progress` on claim → `completed` with breakdown +
      `details_url` deep link; keep crash ("failed to run — not a verdict") distinct from
      verdict. Warn-never-throw on API error.

- [ ] **P0-4 · New-vs-fixed delta (V1)** `[GH-2]`
      Absolute counts punish small PRs for legacy debt and train teams to ignore the check.
      Baseline = latest authoritative assessment (already the persistence semantic).
      **Fix:** classify preview findings vs baseline → `+N new · −M resolved · net Δ` in the
      Check summary. Renames reported as new+resolved pair with a note, not fake certainty.

- [ ] **P0-5 · Check annotations on changed lines** `[GH-3]`
      Counts + links still require leaving the diff.
      **Fix:** annotate **new deterministic source findings on changed lines only**, cap
      (10–20, overflow summarized), batch ≤50/request; no pre-existing, heuristic-only, or
      runtime-only annotations in V1.

- [ ] **P0-6 · Upserted PR summary comment** `[GH-4]`
      A share of developers never open the Checks tab.
      **Fix:** one `<!-- complyloop:summary -->`-marked issue comment per PR, `PATCH`ed on
      later pushes (find-by-marker), never a second comment. Serialize per PR; last-wins.

- [ ] **P0-7 · `check_run.rerequested` → re-enqueue** `[GH-5]`
      A red check has no self-serve retry today ("push an empty commit" behavior).
      **Fix:** handle `check_run` `rerequested` for our check name — re-verify installation
      binding, rate-limit on the `webhook:<projectId>` bucket, enqueue by delivery id.
      Ignore other apps' runs.

- [ ] **P0-8 · AI defaults to a free third-party model** `[verified]`
      `src/ai/ai-call.ts:30` defaults to `poolside/laguna-s-2.1-free`. With
      `AI_GATEWAY_API_KEY` set, customer source snippets + finding context leave the tenant
      to a free tier by default — a data-handling and availability risk for a compliance
      product (and a free tier is not a reliability commitment).
      **Fix:** make AI strictly opt-in with a documented data-flow statement, or default to
      a paid/enterprise model; surface the active model + provider in the UI.

- [x] **P0-9 · No HTTP security headers / CSP** `[verified]`
      **Fixed:** additive `headers()` in `next.config.ts` — HSTS, nosniff, referrer,
      permissions-policy, and a script-neutral CSP (`frame-ancestors`/`object-src`/
      `base-uri` only, so Next/Turbopack/Sentry keep working).

- [ ] **P0-10 · Database restore never drilled** `[verified]`
      `docs/vercel.md` pre-launch checklist: provider backups enabled but the restore drill
      is "pending — not yet drilled". There is no proven recovery from data loss.
      **Fix:** run the documented point-in-time drill to staging, verify dashboard + one
      finding + `ops:check`, record date + owner in `docs/vercel.md`.

- [ ] **P0-11 · `postinstall` mutates `node_modules`** `[verified]`
      `scripts/postinstall-ssrf-guard.mjs` rewrites `node_modules/ssrf-guard/package.json`
      to add a `require` export condition. It is skipped under `--ignore-scripts`, and the
      worker drain then crashes at import with `ERR_PACKAGE_PATH_NOT_EXPORTED` — a
      production outage caused by an install flag.
      **Fix:** pin a working revision via `overrides`, or vendor/patch the package properly.

- [ ] **P0-12 · `evidence` grows unbounded with no alert/runbook** `[verified]`
      Append-only by design (`docs/vercel.md` §5). `ops:check` can check
      `OPS_MAX_EVIDENCE_MB` but the prune is "a superuser-level migration" with no written
      runbook. DB growth to the cap is an outage on the system of record.
      **Fix:** write the superuser prune runbook (keep decision records forever, prune only
      noise kinds), and alert on `pg_total_relation_size('evidence')` growth trend.

- [x] **P0-13 · `.env.example` drifted from production requirements** `[verified]`
      Audit claim was overstated: the file already documented every required key except
      the `ops:check` thresholds.
      **Fixed:** added commented `OPS_MAX_QUEUED_JOBS` / `OPS_MAX_EVIDENCE_MB` to the
      monitoring section of `.env.example`.

- [x] **P0-14 · No `noindex` on authenticated routes** `[verified]`
      **Fixed:** `robots: { index: false, follow: false }` metadata on the `(app)` layout
      (`src/app/(app)/layout.tsx`); marketing routes stay indexable.

- [ ] **P0-15 · Policy-gated conclusions (deterministic-authority gate)** `[GH-6]`
      The product's differentiator is deterministic authority; today the Check cannot
      express it. Blocking on heuristic/AI signals is unsound and gets gates disabled.
      **Fix:** `failure` **iff** new deterministic high-confidence source findings on
      changed lines; `neutral` + "advisory, not a verdict" otherwise. Opt-in per project.
      Gate behind P0-2/P0-4 precision data (pre-commit a ≥95% bar).

---

## P1 — important

- [ ] **P1-1 · Scoped PR scan for speed** `[GH-7]` — PR-files-derived scope set on the
      `scanChangedFiles` fast path for the summary pass; **full scan stays the verdict**
      until scoped/full parity is measured. Surface `scanMode` honestly in the Check text.

- [ ] **P1-2 · Repository intelligence + CODEOWNERS display** `[GH-8]` — connect-time +
      weekly drift read of framework/deps/a11y-tooling presence and `CODEOWNERS` (Contents
      read, no new permission). Surface as glass-box config help; no auto-assign.

- [ ] **P1-3 · Narrow inline review comments** `[GH-9]` — only if annotation data shows
      criticals are missed: new critical deterministic source findings only, cap ~3/PR,
      update-in-place, default off.

- [x] **P1-4 · Remove test scaffolding / dead symbols from shipped code** `[cleanup]`
      **Fixed:** `isDismissalReason` (kept `DISMISSAL_REASONS` — it backs the zod schemas
      in `remediation.ts`), `truncateSnippet` (kept the sync-guard constants — covered by
      `hit-capture.test.ts`), `hasName`, `normalizeSnippet` wrapper, single-use checkout
      quota accessors. Kept `parseRgb` — it is serialized into the page by
      `browser-src-robustness.test.ts`, so the audit's "dead" claim was wrong.
      Remaining (behavior-adjacent, not done): `fast-glob` → `node:fs`, `linkinator` →
      native fetch, `report-tones.ts` / `status.ts` collapse.

- [x] **P1-5 · Drop unused `ui/*` exports** `[cleanup]` — repo rule is "no primitive
      without 2+ consumers". **Fixed (dead exports):** removed `AlertAction`,
      `DialogClose`/`DialogFooter`, `CardAction`/`CardFooter`,
      `AlertDialogMedia`/`AlertDialogAction`, `Tooltip`/`Trigger`/`Content`, and the
      unused menu Portal/Group/Checkbox/Radio/Shortcut/Sub* (~-330 lines, zero importers
      each, verified by grep).
      Remaining (needs visual review per DESIGN.md §43, not done): collapse
      single-consumer `table.tsx` / `sheet.tsx` / `avatar.tsx` / `separator.tsx` /
      `collapsible.tsx` to native elements.

- [ ] **P1-6 · Merge duplicate runtime evaluators** `[cleanup]` —
      `hit-capture-evaluate.ts:42-145` has two ~50-line near-identical bodies
      (`pageEvaluateWithHitCapture` / `locatorEvaluateWithHitCapture`); hoist the duplicated
      `backgroundRgb` in `non-text-contrast.ts`.

- [ ] **P1-7 · Replace `fast-glob` with `node:fs` `globSync`** `[cleanup]` —
      `source-files.ts:3,46-58`; engines already require Node ≥22.22. −1 dependency.

- [ ] **P1-8 · Replace `linkinator` with a native `fetch` loop** `[cleanup]` —
      `runtime/site-level/link-check.ts:151-193`; anchors are already enumerated and each
      URL already SSRF-gated. −1 dependency.

- [ ] **P1-9 · Inline single-caller `ConnectProjectDialog`** `[cleanup]` —
      `src/components/github/connect-project-dialog.tsx:1-48` has one production caller;
      fold into `connect-project-panel.tsx`.

- [ ] **P1-10 · Collapse display tables** `[cleanup]` — `report-tones.ts:102-142` (five
      hand-listed derived records → one `mapTone(pick)`) and `status.ts:21-281` (eight
      near-identical interfaces → shared `ToneDisplay`/`BadgeDisplay`/`SeverityDisplay`).

- [ ] **P1-11 · `GH_WORKER_DISPATCH_TOKEN` least privilege + rotation** `[verified]` —
      it is a long-lived fine-grained PAT with Actions write used only to fire
      `repository_dispatch`. Document scope, add a rotation runbook (or mint a short-lived
      App token instead).

- [ ] **P1-12 · CI / supply-chain hardening** `[verified]` — no Dependabot or `npm audit`
      step; Node version is 22 in CI but `engines` is absent and `.nvmrc` missing
      (worker workflow pins 24). Add Dependabot, an audit gate, and pin Node once.

- [ ] **P1-13 · Client-component / bundle budget pass** `[verified]` — DESIGN §41 wants
      server rendering preferred. Audit `(app)` leaves for unnecessary `"use client"`,
      confirm the `radix-ui` barrel optimization is effective, and set a bundle-size budget
      from `npm run analyze` (bundle-analysis job currently uploads but never fails).

- [ ] **P1-14 · Evidence/report deep links + `details_url` V2** `[GH-1]/[GH-2]` — V1 links
      to the assessment page; per-finding deep links from the PR/Check are the payoff.
      Confirm router readiness, then link resolved findings to their verify evidence.

- [ ] **P1-15 · Widen the axe e2e gate** `[verified]` — `e2e/a11y.spec.ts` already runs axe
      over a few targets; extend it to every authenticated route plus keyboard/focus-order
      assertions so the product keeps holding itself to the bar it sells.

---

## Notes

- P0-1, P0-2, P0-8, P0-9, P0-10, P0-11, P0-12, P0-13, P0-14 were verified in-tree; the
  GH-1…GH-6 items are the audit's own "Now" set and remain unimplemented.
- The GH audit's **Avoid** list (per-finding issue sync, SARIF-as-primary, external-CI-as-
  evidence, per-commit scans, auto-review-requests, merge-blocking on heuristic/AI) is a
  recorded decision — do not reopen without new evidence.
- Definition of done: `npm run verify:gate`.

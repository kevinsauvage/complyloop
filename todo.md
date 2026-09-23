# TODO — critical items remaining

Analysis date: 2026-09-23 (easy wins + serverless-path removal applied).
Baseline: `npm run verify:gate` green. Each item cites evidence and a concrete
fix. Order = severity.

## P0 — security / data integrity

- [ ] **1. Replace the `ssrf-guard` node_modules patch with a real fix.**
      `scripts/postinstall-ssrf-guard.mjs` rewrites
      `node_modules/ssrf-guard/package.json` at install time because published
      1.0.0 flapped its exports map. It silently no-ops under
      `npm ci --ignore-scripts`, breaks on any lockfile bump, and mutates a
      dependency's manifest. Fix: pin a known-good revision, vendor the package, or
      add the `require` condition via `overrides`/`patch-package` with a lockfile.

- [ ] **2. Add `default-src`/`script-src` to the CSP.**
      `next.config.ts:headers()` ships only
      `frame-ancestors 'self'; object-src 'none'; base-uri 'self'`. There is no
      `default-src` or `script-src`, so the browser default (allow-all) is the real
      script policy — the top XSS mitigation is absent. Fix: nonce/hash-based
      `script-src` for production, permissive policy dev-only.

- [ ] **3. Drop the unused `Checks R/W` GitHub App permission.**
      `docs/ai/architecture.md:279-280` records that PR Check Runs were removed and
      the permission is granted but unused. Fix: remove it from the App
      registration and update `.env.example:37` + `README.md:46`.

- [ ] **4. Get off `next-auth@5.0.0-beta.32` in production.**
      Auth is the highest-risk surface and it runs on a beta release. Fix: track the
      stable v5 release, or pin a reviewed beta with a comment + Renovate rule.

## P1 — reliability / operations

- [ ] **5. The 15-minute backstop can silently stop.**
      GitHub auto-disables scheduled workflows after 60 days of repository
      inactivity. The `assessment-worker` `*/15` schedule is the only recovery for
      failed dispatches, killed tasks, and expired leases (`docs/vercel.md:96-109`).
      Fix: add a keepalive (scheduled no-op) or external pinger, and alert on
      "queue depth > 0 for > N minutes".

- [ ] **6. Migrations run on every deploy — including previews.**
      `vercel-build: "npm run db:migrate && npm run build"` (package.json) runs for
      all deployments, so a preview pointed at a shared/staging `DATABASE_URL`
      applies unreviewed SQL before review. Fix: skip `db:migrate` on non-production
      Vercel envs (branch on `VERCEL_ENV`); document preview DB isolation.

- [ ] **7. Gate bundle size in CI.**
      The `bundle-analysis` job uploads `.next/diagnostics/analyze/` as an artifact
      but enforces no budget. Fix: assert a max First Load JS for the heaviest routes
      and fail the job on regression.

## P2 — correctness / quality

- [ ] **8. Raise branch coverage on decision/security paths.**
      Lowest in the repo: `src/server/actions/shared.ts` 45% branches,
      `src/server/assessment/remediation-verify-worker.ts` 39%,
      `src/server/actions/alerts.ts` 33%. These decide permissions, refresh scope,
      and verification outcomes; the global 80% floor hides them. Fix: focused tests
      or per-file floors.

## P3 — simplification (from `docs/ai/over-engineering-audit.md`)

- [ ] **9. Drop unused `ui/` primitives and exports.**
      Repo rule is "no primitive without 2+ consumers", but `dropdown-menu` unused
      subcomponents, `tooltip` `Tooltip`/`Trigger`/`Content` (only `TooltipProvider`
      is used), `sheet`, `avatar`, `collapsible`, `separator`, and unused
      `dialog`/`card`/`alert` exports remain. Verify each with `rg` before deleting.

- [ ] **10. Replace `fast-glob` with `node:fs` `globSync`.**
      `packages/analysis-core/src/source-files.ts:3`; engines already require Node
      ≥22.22, which ships `fs.globSync`. Verify glob semantics in
      `source-files.test.ts`, then drop the dependency.

- [ ] **11. Replace `linkinator` with a native fetch crawl.**
      `packages/analysis-core/src/runtime/site-level/link-check.ts`; anchors are
      already enumerated and each URL is already SSRF-gated. Covered by the
      runtime/link-check tests.

- [ ] **12. Merge duplicated runtime evaluators and display tables.**
      `hit-capture-evaluate.ts:42-145` has two ~50-line near-identical evaluator
      bodies; `src/core/display/report-tones.ts` and `status.ts` hand-list derived
      records. Fix: one internal evaluator and one `mapTone(pick)`/shared display
      interface (no behavior change).

---

## Applied

Easy wins (2026-09-23):

- Unauthenticated `/api/health` no longer returns queue depth or latency.
- Worker bundle (`npm run worker:build`) now built in CI.
- Root `engines` + `.nvmrc` added; worker/ops workflows aligned to Node 22.
- Dependabot added for npm + GitHub Actions.
- `.env.example`: documented `NEXT_PUBLIC_APP_URL`.
- `docs/ai/github-integration-audit.md`: historical banner on superseded sections.

Serverless-path removal (2026-09-23):

- Deleted the dead `@sparticuz/chromium` serverless branch in
  `packages/analysis-core/src/runtime/scan.ts`; runtime audits use the
  executor's local Playwright Chromium only.
- Removed the `@sparticuz/chromium` dependency (16 packages) and its
  `next.config.ts` external/trace entries.
- Pruned the sparticuz error patterns (`scan-error.ts`) + their tests, and the
  `ASSESSMENT_RUNTIME_BROWSER` env contract.

### Method notes

- Not included: deliberate, documented decisions (no per-PR Check Runs,
  `force-dynamic` on JSON routes, no Vercel Cron, AI never setting statuses,
  evidence append-only). Do not "fix" these without a product decision.
- Re-run `npm run verify:gate` after each item; `graft build` after structural
  changes.

# TODO — critical items remaining

## P1 — reliability / operations

- [ ] **4. Migrations run on every deploy — including previews.**
      `vercel-build: "npm run db:migrate && npm run build"` (package.json) runs for
      all deployments, so a preview pointed at a shared/staging `DATABASE_URL`
      applies unreviewed SQL before review. Fix: skip `db:migrate` on non-production
      Vercel envs (branch on `VERCEL_ENV`); document preview DB isolation.

## P2 — correctness / quality

- [ ] **6. Raise branch coverage on decision/security paths.**
      Lowest in the repo: `src/server/actions/shared.ts` 45% branches,
      `src/server/assessment/remediation-verify-worker.ts` 39%,
      `src/server/actions/alerts.ts` 33%. These decide permissions, refresh scope,
      and verification outcomes; the global 80% floor hides them. Fix: focused tests
      or per-file floors.

## P3 — simplification (from `docs/ai/over-engineering-audit.md`)

- [ ] **8. Replace `fast-glob` with `node:fs` `globSync`.**
      `packages/analysis-core/src/source-files.ts:3`; engines already require Node
      ≥22.22, which ships `fs.globSync`. Verify glob semantics in
      `source-files.test.ts`, then drop the dependency.

- [ ] **9. Replace `linkinator` with a native fetch crawl.**
      `packages/analysis-core/src/runtime/site-level/link-check.ts`; anchors are
      already enumerated and each URL is already SSRF-gated. Covered by the
      runtime/link-check tests.

- [ ] **10. Merge duplicated runtime evaluators and display tables.**
      `hit-capture-evaluate.ts:42-145` has two ~50-line near-identical evaluator
      bodies; `src/core/display/report-tones.ts` and `status.ts` hand-list derived
      records. Fix: one internal evaluator and one `mapTone(pick)`/shared display
      interface (no behavior change).

--

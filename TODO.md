# TODO — Master priority list (unified)

## P2 — Medium

- [ ] **16. Axe containment (ASSESSMENT P2-9) — batch E**
      Per-page axe containment like custom probes; total outage still → `unable_to_verify`.

- [ ] **17. Settings-to-assessment gap (TODO-11) — batch B**
      Save-and-run CTA, origin-only documented, confirm destructive clear, poll backoff + max duration, paginate 5-job history.

- [ ] **18. Secret dual-use + URL/secret edges (TODO-12 + TODO-14) — batches C/I**
      Dedicated `GITHUB_TOKEN_ENCRYPTION_KEY` (or honest rotation doc + delete false "re-encrypts" note); `DATABASE_SSL_INSECURE` prod guard; scope `GITHUB_API_BASE_URL`; redaction unit test.

- [ ] **19. Docs-vs-reality (TODO-15: incremental wording, orphan banner) — batches B/G**
      Document snapshot-diff + always-full-runtime, surface `scanMode`; fix orphan count vs `by_cause`.

- [ ] **20. Error reporting + boundaries + demo delete (CODE-P1 + NEXTJS-P2 ×2) — batch D**
      One server + one tiny client reporter; fold `ReportedError` into `AppErrorCard`; delete `sentry-example-page/`; add 4 missing segment `error.tsx` (or record fallback intentional).

- [ ] **21. Form stack + providers + RepoList RSC (CODE-P1 + NEXTJS-P1 providers + NEXTJS-P2 RepoList) — batch H**
      One `ActionForm` (confirm as prop), single toast helper, merge note-fields; move `TooltipProvider`+`Toaster` to `(app)/layout.tsx`; `GitHubRepoList` back to RSC.

- [ ] **22. DB plumbing + workspace reads remainder (CODE-P1 ×2) — batches A/B**
      Collapse `mappers`/`apply`/`upsert-guard` toward direct Drizzle (behind `test:db`); finish single permission assert + single finding lookup.
- [ ] **23. Catalog + AST helpers (CODE-P1 ×2) — batch E**
      One controls/presets keyed by framework; inline single-use ARIA wrappers only.
- [ ] **24. Requirement id stability (ASSESSMENT P2-11, deferred-ok) — batch F**
      Deterministic ids per `(project, control)` when revisited; audit assessment-delete cascade. Explicitly deferred — do with retention docs (#8), not alone.

## P3 — Low (polish, any order)

- [ ] **25. Config-consistency tests (TODO-16) — batch D**
      Health reports harness mode; tests for internal-run 503/401/429, `ops:check` fail cases, export route boundary.
- [ ] **26. Client-bandle leftovers (NEXTJS-P3 ×5 + CODE-P1 UI pruning + CODE-P2 memo/defensive/date/validation + CODE-P3 types/caches/nits) — batch H/G**
      Drop `"use client"` from `role-select`/`github-repo-picker-empty`; fold `form-classes`/`href`/`params`/`db.ts` re-export/`active-project-page`; move picker hooks to `hooks/`; link mirrored validators; `ai/` rename; single `formatDateTimeWithZone`; delete trivial `useMemo`/`useCallback`; `safeStorage`; fold `parseEntityId`; inline single-use types; direct static lookups; shared `LoadingSkeleton`. No behavior change; do as one cleanup sweep per area, not 15 branches.
- [ ] **27. Generic-component audit (NEXTJS-P3, observation) — batch G**
      No diff now; prefer local variants over extending universal renderers next time a header/status is added.

---

## Recommended execution order (waves)

1. **Wave 0 — unblock:** #2 + #3 (batch A, one branch) → #1 (batch D ops).
2. **Wave 1 — support tickets:** #10 → #11 → #5 (batch C) + #6 (batch H invite).
3. **Wave 2 — safety:** #7 + #8 (rate-limit, evidence) + #9 (scheduler, same branch as #1).
4. **Wave 3 — perf + readability:** #4 (batch B loaders) + #13 (batch E scan) + #14 (batch G report/display).
5. **Wave 4 — correctness copy:** #12 + #15 + #24 + #8-retention (batch F).
6. **Wave 5 — UX gaps:** #17 + #19 + #18 + #20 + #21 (batches B/D/H/I).
7. **Wave 6 — polish:** #22 + #23 + #25 + #26 + #27.

## Definition of done (merged)

- `npm run verify:gate` green (lint + typecheck + test + build + bundle check).
- Prod observable: scheduled `ops:check` fails on queue/evidence growth; restore drill dated + owned.
- One write path, one loader per page (incl. settings), one GitHub entry point, one report model, one badge path, one form path, one probe harness.
- Revoked/renamed/expired → repair path; invites validated + expiring; expensive mutations rate-limited; evidence monitored; worker exceptions post Check Runs; site findings read as site findings; sessions/config errors explicit.

# TODO — Master priority list (unified)

> Connects the four audit files into one execution order.
> Sources: `TODO-COMPLETENESS.md` (product completeness), `TODO-ASSESSMENT-FLOW.md`
> (assessment/scan), `TODO-NEXTJS-ARCHITECTURE.md` (App Router/layers),
> `TODO-CODE-REDUCTION.md` (code deletion/simplification).
> Priority merge rule: Completeness P0 > Architecture P0 > anything P1 > P2 > P3.
> Within a level, user-facing / prod-risk beats pure cleanup.
> "Do with" = touch the same files — implement together or back-to-back in one branch,
> otherwise you will conflict with yourself. Per `AGENTS.md`, any batch touching
>
> > 2 files needs a short plan + approval before editing.

## Batch map — what to treat at the same time

| Batch                                        | Items (do together)                                                                                                                                                                                                                                                                                 | Why one branch                                                                                                                                                                                                                                                   |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Write pipeline + action idiom**         | NEXTJS-P0 (workspace-write→actions inversion) · NEXTJS-P1 action-trio · NEXTJS-P1 ActionState import · CODE-P0 write-unify · CODE-P0 action-chain · CODE-P3 payload/context types                                                                                                                   | Same 6 files: `workspace-write.ts`, `actions/shared.ts`, `actions/define-action.ts`, `actions/refresh-routes.ts`, `action-state.ts`, `core/action-state.ts`. Splitting guarantees rebase conflicts.                                                              |
| **B. Loader / read layer + settings**        | NEXTJS-P1 project-view split · NEXTJS-P1 settings loader · NEXTJS-P1 Promise.all · CODE-P1 workspace reads · COMPLETENESS TODO-11 (settings gap) · COMPLETENESS TODO-15 (scanMode/orphan)                                                                                                           | Same file: `project-view.ts` (769 lines) + `settings/page.tsx` + `assessment-job-status-live.tsx`. Split the god-loader first, then land the settings/save-and-run/poll fixes on top.                                                                            |
| **C. GitHub boundary + repair + PR signals** | NEXTJS-P1 github-connector · COMPLETENESS TODO-04 (repair flow) · TODO-08 (PR check-run + branch msg) · TODO-10.3 (revoked-vs-expired) · COMPLETENESS TODO-12 (AUTH_SECRET dual-use)                                                                                                                | Same modules: `github*.ts`, `github-connector.ts`, `connect.ts`, `connect-project-panel.tsx`, picker hooks. Connector decision (facade vs delete) must land before the repair banner; revoked-vs-expired classification feeds the TODO-04 banner.                |
| **D. Ops / scheduler / error reporting**     | COMPLETENESS TODO-03 (ops hardening) · TODO-07 (evidence size) · TODO-16 (ops-path tests) · ASSESSMENT P2-1 (scheduler collapse) · CODE-P2 test/harness leftovers (`build-worker.mjs`) · CODE-P1 error-reporting + NEXTJS-P2 sentry demo + NEXTJS-P2 error boundaries                               | Same surface: `assessment-worker.yml`, `jobs/run/route.ts`, `operations-check.ts`, `health/route.ts`, `assessment-{runner,inline,dispatch,worker}.ts`, `observability.ts`, `sentry-example-page/`. Unify the drain + fail-case `ops:check` + health in one pass. |
| **E. Scan hot loop + runtime**               | ASSESSMENT P2-3 (reconcile index) · P2-4 (checkout walks) · P2-9 (axe containment) · CODE-P0 probe sprawl · CODE-P1 catalog trees · CODE-P1 AST helpers                                                                                                                                             | Same tree: `assessment*.ts`, `analysis-core/runtime/**`, `catalog/*`. Index + walk-fold + probe harness share tests (`custom-checks`, `catalog-coverage`, `check-authority`).                                                                                    |
| **F. Remediation / AI / finding copy**       | ASSESSMENT P2-5 (history dual-write) · P2-6 (stale AI) · COMPLETENESS TODO-09 (site copy) · NEXTJS-P3 ai naming · COMPLETENESS TODO-13 (retention docs) · ASSESSMENT P2-11 (requirement id/cascade)                                                                                                 | Same domain: `remediation-*.ts`, `finding-act.ts`, `handoff.ts`, `pr.ts`, `finding-next-step-panel.tsx`, `remediation-history.tsx`. Decide "evidence is the log" once, then fix copy + staleness on top.                                                         |
| **G. Report / display / evidence UI**        | CODE-P0 report stack · CODE-P0 display tower · CODE-P1 micro-barrels · CODE-P2 date split · CODE-P3 caches/types/nits · NEXTJS-P3 generic-component audit · COMPLETENESS TODO-15.1/15.4 (already done — verify only)                                                                                | Same tables: `reporting/*`, `core/display/*`, `badges.tsx`, `formatted-datetime.tsx`, `page-primitives.tsx`. One badge/model pass; snapshot-test reports before/after.                                                                                           |
| **H. Forms / client bundle / validation**    | NEXTJS-P1 providers move · NEXTJS-P2 GitHubRepoList RSC · NEXTJS-P3 role-select/tiny-modules/hooks-relocate/validation-mirror · CODE-P1 form stack · CODE-P1 UI primitives · CODE-P2 memo/defensive/validation-fold · COMPLETENESS TODO-05 (invite lifecycle) · TODO-06 rate-limit (form/org paths) | Same bundle: `components/*`, `hooks/*`, `core/validate.ts`, `invite-member-form.tsx`, `org-members-card.tsx`. RSC-ify + fold + invite-copy + rate-limit in one form-system pass.                                                                                 |

---

## P1 — High (user-facing + high-value simplification)

- [ ] **4. Loader split + settings loader + parallelize (NEXTJS-P1 ×3 + CODE-P1 workspace reads) — batch B**
      Split `project-view.ts` per route (`view-shared.ts` for shared bits); add `loadSettingsView()`; `Promise.all` independent awaits in loaders + `ConnectProjectPanel`.

- [x] **5. Repair flow + PR failure signals (TODO-04 + TODO-08) — batch C**
      Classified failure causes → repair banner (install URL + reconnect); post Check Run `failure`/`neutral` on worker exception; fix ephemeral-branch message. Requires TODO-10.3 signal (below).

- [x] **6. Invite lifecycle (TODO-05) — batch H**
      GitHub-login verification, invite expiry/cleanup, Invite-vs-Change-role copy, leave action with last-owner guard.

- [ ] **7. Rate limits (TODO-06) — batches H/I**
      Limits on runtime-audit, remediation/requirements, org create/invite, export; throttle/cache health probe.

- [ ] **8. Evidence alert (TODO-07) + retention docs (TODO-13) — batch D/F**
      Evidence size + row count in `ops:check` (warn/fail) ± health; retention matrix (disconnect vs project vs org delete × findings/evidence/tokens).

- [ ] **9. Scheduler collapse (ASSESSMENT P2-1) — batch D**
      One `assessment-scheduler.ts`, one limit default, evaluate deleting `build-worker.mjs`. After dispatch topology stabilizes; same branch as #1.

- [x] **10. GitHub boundary decision (NEXTJS-P1 connector) — batch C**
      Facade-as-enforced-boundary (recommended) or delete. Land before #5.

- [x] **11. Auth session edges (TODO-10) — batches C/I**
      Explicit `session.maxAge/updateAge`; map prod-config throw to `Configuration` login copy; revoked-vs-expired refresh signal (feeds #5).

- [ ] **12. Site-copy fix (TODO-09) — batch F**
      Branch `site` explicitly in `findingAct`/`handoff.ts`/PR rejection (re-audit wording, not PR).

- [ ] **13. Scan hot loop (ASSESSMENT P2-3 index + P2-4 walk-fold) + probe consolidation (CODE-P0) — batch E**
      Index findings once per run; unify snapshot/scan scope + fold quota into snapshot walk; probe table + single harness.

- [ ] **14. Report + display collapse (CODE-P0 ×2) — batch G**
      One report model (HTML from markdown or shared helpers, drop hand caches); one `status-display.ts`, delete `mustGet`/barrel/7 badge wrappers.

## P2 — Medium

- [ ] **15. Remediation history + AI staleness (ASSESSMENT P2-5 + P2-6) — batch F**
      Derive history view from evidence (stop writing `history[]`); stamp AI artifacts with `assessmentId`/`gitHead`, invalidate on re-detect, cap `explanations[]`.
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

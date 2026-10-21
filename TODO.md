# TODO — full audit follow-ups

Source: full audit run via `docs/prompts/master.md` (2026-10-21). Findings were traced in code by read-only agents; re-verify before fixing. Ask first for `drizzle/`, `src/core/`, `packages/analysis-core/src/contract/`.

**Size:** `S` ≈ under 1h, one file · `M` ≈ half a day, a few files + tests · `L` ≈ 1+ day or needs design. Sizes are rough estimates, not measured.

## P0 — blocking

- [ ] **`L`** **Chromium with prod secrets in env** — `packages/analysis-core/src/runtime/scan.ts:167,286`: minimal `env`, `chromiumSandbox`, ideally split browser step from DB/App-key job. _Why:_ a renderer exploit on a customer page could reach the prod DB and App key. Exploitability unverified. **Deferred** — needs a design decision on the worker topology (browser step split from the DB/App-key job) and can break production rendering; not a drive-by fix.

## P1 — should fix

**Correctness**

- [ ] `S` Exception over a human pass leaves status `passed` (`requirements.ts:179-192`). **Deferred** — fix belongs in `src/core/requirements/requirement-human-determination.ts` (ask-first boundary).
- [ ] `M` Portfolio/findings-list counts ignore preset scope (`packages/db/src/repo/portfolio.ts:75-95`, `findings-view.ts:203-217`). **Deferred** — needs a scoped-count design (per-preset control-id sets in the grouped SQL).

**Accessibility**

- [ ] `M` "Opens in a new tab" disclosure on `target=_blank` links (RGAA 13.2).
- [ ] `M` Label-in-name fixes; persistent live region + field-error association; unique repeated link names; unique `nav` names; heading levels.

**Performance**

- [ ] `M` Repo picker: cache, real `page` handling, filter before slice, parallel installations.

**Architecture & quality**

- [ ] `L` Move job-queue SQL to `packages/db/src/repo/` (or document the exception).
- [ ] `M` Route GitHub calls through `github-connector.ts` or narrow its header.
- [ ] `M` Single auth-config module (4 duplicated gates, 2 copies of `assertProductionGitHubAuth`).
- [ ] `M` One `isOneOf` guard + `zeroCounts` helper (≈17 casts).
- [ ] `L` Split files >300 lines / functions >200 lines (start with `assessment.ts`, `scan.ts`, `FindingsPage`, `EvidencePage`).

**Dependencies & tests**

- [ ] `M` Tests: `remediation.ts` bulk foreign-project + non-open dismiss; `requirements.ts` exception expiry (and the hardcoded `2026-12-31`); `webhook-deliveries` + `rate-limit` DB tests (add to `test:db`); the 3 evidence download routes; `openProjectAction`.

## P2 — docs & cleanup

- [ ] `M` Use `testFinding` fixture in the 9+ test files with hand-written Finding literals.

## Needs a human decision

- [ ] Bind invites to GitHub numeric id (not recyclable login)?
- [ ] Is `deleteEvidenceForOrg` an accepted exception to append-only? Document in rules.
- [ ] Disconnect cascade-deletes exceptions/dismissals — acceptable?
- [ ] Keep barrels `core/filter-params.ts` / `core/display.ts` (amend `code-quality.mdc`) or remove (~40 imports)?
- [ ] Enable `noUncheckedIndexedAccess`?
- [ ] Reword "no `use client` above `@/server/*`" to exempt server actions?
- [ ] `j`/`k`: opt-out, modifier, or drop? `PathnameFocus` on first load?
- [ ] Cap 5,000-row loads now or measure first? Accept dynamic marketing pages (CSP nonce)?
- [ ] May `member` record exceptions / human passes?
- [ ] Resolved finding reappears → new Finding; intended vs "reopen with history intact"?
- [ ] `not_applicable` in `passRate` denominator?
- [ ] Extend patch gate beyond a11y re-scan? Split worker runner from runtime audit?
- [ ] Keep `diff` dep for one consumer? Move `tw-animate-css` to devDependencies?

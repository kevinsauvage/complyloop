# TODO — full audit follow-ups

Source: full audit run via `docs/prompts/master.md` (2026-10-21). Findings were traced in code by read-only agents; re-verify before fixing. Ask first for `drizzle/`, `src/core/`, `packages/analysis-core/src/contract/`.

**Size:** `S` ≈ under 1h, one file · `M` ≈ half a day, a few files + tests · `L` ≈ 1+ day or needs design. Sizes are rough estimates, not measured.

## P0 — blocking

- [ ] **`L`** **Chromium with prod secrets in env** — `packages/analysis-core/src/runtime/scan.ts:167,286`: minimal `env`, `chromiumSandbox`, ideally split browser step from DB/App-key job. _Why:_ a renderer exploit on a customer page could reach the prod DB and App key. Exploitability unverified. **Deferred** — needs a design decision on the worker topology (browser step split from the DB/App-key job) and can break production rendering; not a drive-by fix.

## P1 — should fix

**Correctness**

- [ ] `S` Exception over a human pass leaves status `passed` (`requirements.ts:179-192`). **Deferred** — fix belongs in `src/core/requirements/requirement-human-determination.ts` (ask-first boundary).
- [ ] `M` Portfolio/findings-list counts ignore preset scope (`packages/db/src/repo/portfolio.ts:75-95`, `findings-view.ts:203-217`). **Deferred** — needs a scoped-count design (per-preset control-id sets in the grouped SQL).

**Architecture & quality**

- [ ] `L` Move job-queue SQL to `packages/db/src/repo/` (or document the exception).
- [ ] `M` One `isOneOf` guard + `zeroCounts` helper (≈17 casts). **Deferred** — a single helper shared by `src/core` and `packages/db` needs a contract-level util (ask-first); per-package duplicates would not be one helper.
- [ ] `L` Split files >300 lines / functions >200 lines (start with `assessment.ts`, `scan.ts`, `FindingsPage`, `EvidencePage`).

**Dependencies & tests**

- [ ] `M` Tests: `remediation.ts` bulk foreign-project + non-open dismiss; `requirements.ts` exception expiry (and the hardcoded `2026-12-31`); `webhook-deliveries` + `rate-limit` DB tests (add to `test:db`); the 3 evidence download routes; `openProjectAction`.

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

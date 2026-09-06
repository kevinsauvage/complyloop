# ComplyLoop — Final TODO

> **Status (2026-09-06): all five items implemented** in the working tree.
> P0 #1 (fail-closed Verify), P1 #2 (do not resolve runtime findings unless
> `runtimeRan`), P1 #3 (forward engine flags on verify — part of #1), P2 #4
> (refresh `defaultBranch` from the webhook payload) and P2 #5 (core-loop e2e
> no longer treats “still detected” as a closed loop) are in source. The
> original findings are retained below as the audit record.

Audit date: 2026-09-06 · Code is the source of truth.

## Verdict

**Project health: strong.** The remaining compliance-integrity holes from this
audit are fixed in the working tree: Verify fails closed on a page that did
not actually show the content, site-level findings re-run the site audit,
source findings cannot be “verified” by applying a local patch, runtime
findings stay open when the preview URL is cleared, and GitHub default-branch
renames no longer silently kill monitoring.

---

## P0 — Blocking

### 1. Verify can mark a remediation verified — and pass `standard` requirements — without auditing the real content

- **Done.** `gotoForRuntimeAudit` rejects non-2xx, redirects away from the
  audited path, and empty documents. `runtimeViolationStillPresent` requires
  `loadedCleanly` and a matching final URL. `verifyRemediationAction` refuses
  source findings, re-runs `scanRuntime` for site-level findings, and forwards
  `runtimeRan` / `siteLevelChecksRan` / `htmlValidateRan` on success. The
  apply-patch-then-`locateViolation` branch is deleted.

---

## P1 — High Priority

### 2. Clearing (or failing) the preview URL can resolve runtime findings and pass composition-sensitive requirements from an empty AST

- **Done.** `shouldResolveOpenFinding` never resolves a runtime/DOM/site
  finding unless `runtimeRan`.

### 3. Successful runtime verify does not close runtime-only / site-level requirements

- **Done** as part of P0 #1.

---

## P2 — Medium Priority

### 4. Stored `github.defaultBranch` is never refreshed — monitoring can silently die after a rename

- **Done.** Webhooks use `repository.default_branch` as the live default and
  persist it onto the project when it changes. Pushes to the stale stored
  name are ignored.

### 5. The e2e core-loop test accepts a failed verify as success

- **Done.** The e2e no longer treats `/Fix verified|still detected/` as
  equivalent. The sample-app fixture still contains the violation (and
  localhost previews are SSRF-blocked), so a visible Verify button must fail
  closed. Successful verify and draft-PR auto-verify stay in unit tests
  (`remediation-workflow.test.ts`, `assessment.test.ts`,
  `assessment-worker.test.ts`).

---

## Recommendation

> Fixed before production: P0 #1, P1 #2, P1 #3. Fixed afterward in the same
> pass: P2 #4, P2 #5. Nothing else from the audit is worth doing.

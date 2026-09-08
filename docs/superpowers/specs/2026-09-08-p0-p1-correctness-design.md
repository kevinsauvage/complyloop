# P0 + P1 Correctness Pass — Design

Date: 2026-09-08  
Source backlog: `todo.md`  
Scope: **P0 and P1 only**. P2/P3 remain for a follow-up.

## Goal

Close live correctness and security gaps that falsify or weaken the Requirement → Assessment → Finding → Remediation → Verification → Evidence loop, without optional refactors.

## Decisions (locked)

| Topic | Choice |
| --- | --- |
| Scope | P0 + P1 only |
| P1-4 heuristics | Audit keep/drop (concrete developer action required) |
| Absolute routes | Reject in `parseRoutes` **and** validate every URL in `scanRuntime` |
| Execution | Sequential item-by-item in backlog order |
| Commits | One logical commit per item when the user requests commits |

## Out of scope

- P2 (selector unification, emulated-media helpers, file splits, check CLI contract, empty-routes UX docs, Record migration)
- P3 (platform a11y polish, badges SSR, FindingKind rename/exception, missing RTL tests, form copy-only, architecture id drift cleanup beyond a light skim after P1-4)

## Work items

### P0-1 — `scanRuntime` per-URL SSRF guard + reject absolute routes

**Problem:** Only the base URL is validated; absolute route strings bypass the contract on the injected-scanner path.

**Design:**

1. In `scanRuntime`, after building `urls` via `joinRuntimeUrl`, `await assertSafeRuntimeUrl(url, lookup)` for each URL.
2. On failure, return `{ findings: [], pagesScanned: 0, error: UNSAFE_RUNTIME_URL_MESSAGE }` without calling the scanner.
3. Keep Playwright `allowRuntimeNavigation` / request interceptor as defense-in-depth.
4. In `parseRoutes` (`runtime-audit.ts`), reject absolute `http(s)://` route strings so routes remain paths under the base origin.

**Verification:** `npx vitest run packages/analysis-core/src/runtime/url-safety.test.ts`; runtime-audit tests; then broader `npm run test` as part of the pass.

### P0-2 — In-memory `OrgMembershipIndex`

**Problem:** Hot paths repeatedly scan all `db.memberships` rows.

**Design:**

1. Add `OrgMembershipIndex` with `Map<userId, OrgMembership[]>` and `Map<orgId, OrgMembership[]>`.
2. Route `userRoleInOrg` / `orgsForUser` / `membershipsForOrg` / `canManageOrgMembers` through the index (build once per call site batch or as a small helper used by those functions).
3. No SQL / schema changes. Do **not** split `orgs.ts` (P2-4).

**Verification:** `orgs.test.ts`; unit assertion that index membership sets match filter-scan results.

### P1-1 — error-prevention dataset keys

**Problem:** Runtime probe passes HTML attribute names into `form.dataset[...]` instead of camelCase dataset keys.

**Design:**

1. Pass `[...ERROR_PREVENTION_CONFIRM_DATASET_KEYS]` into the probe.
2. Regression: attr → dataset key round-trip (`data-review-step` → `reviewStep`).
3. Assert a form with `data-review-step` is not flagged by the runtime probe.

**Verification:** New unit test + existing AST error-prevention tests.

### P1-2 — Atomic rate-limit increment

**Problem:** Read-then-increment under advisory lock invites undercount if the lock contract ever weakens.

**Design:**

1. Replace RMW with conditional update: `UPDATE … SET count = count + 1 … WHERE key = $1 AND count < $2`.
2. Limit hit when no row updated (`rowCount === 0`) after the insert/reset path has ensured a row exists for the window.
3. Keep advisory lock for window-reset serialization.
4. Add concurrent-writer test (limit 1 → exactly one success) if not already covered.

**Verification:** `rate-limit.test.ts` + new concurrency case.

### P1-3 — Validate PR head SHA in webhooks

**Problem:** PR `head.sha` accepts any non-empty string; push `after` requires 40-hex.

**Design:** Apply the same `/^[0-9a-f]{40}$/i` rule to `pull_request.head.sha`. Invalid → event ignored (`handled: false`).

**Verification:** `webhook.test.ts` case `head.sha: "not-a-sha"` → `handled: false`.

### P1-4 — Low-confidence heuristic audit

**Criterion:** Keep only if finding copy gives a concrete developer action.

| Keep | Drop (remove from registry; delete modules/tests) |
| --- | --- |
| `pointer-gesture` | `focus-context-change` |
| `motion-actuation` | `input-context-change` |
| `audio-description-track` | `sensory-characteristics` |
| `captions-live` | `error-suggestion` |
| `p-as-heading` | `image-of-text` |

Also delete shared helpers only used by dropped checks (e.g. `make-context-change-check` if unused). Update registry/catalog coverage. Light skim of `docs/ai/architecture.md` for deleted ids only (full P3-6 is follow-up).

**Verification:** `npm run test:coverage` (registry); no catalog-coverage failures.

### P1-5 — Shared `AutoSubmitSelectForm`

**Problem:** `OrgSwitcher` / `ProjectSwitcher` duplicated and drifting.

**Design:** Extract `AutoSubmitSelectForm` (`id`, `name`, `action`, `label`, `options`, `className`) under `src/components/`; keep thin typed wrappers.

**Verification:** RTL — hide with ≤1 option; change submits; accessible name via Label; app-shell/nav tests green.

### P1-6 — Unified status counting for pages

**Problem:** Dashboard/requirements hand-roll `Map` counts without zero-fill; diverge from `countByStatus`.

**Design:** Add `countByStatusMap` (or `toStatusCountMap`) beside `countByStatus`; use on both pages. Do **not** migrate chips to `Record` (P2-9).

**Verification:** Unit test that page counts match `countByStatus(..., REQUIREMENT_STATUSES)`; `npm run test`.

## Implementation order

1. P0-1 → 2. P0-2 → 3. P1-1 → 4. P1-2 → 5. P1-3 → 6. P1-4 → 7. P1-5 → 8. P1-6

After each item: run that item’s verification. After the full pass: `npm run lint && npm run typecheck && npm run test && npm run build`. Move completed items in `todo.md` to the Completed section.

## Testing strategy

- Prefer existing colocated tests; extend them rather than inventing parallel suites.
- Domain/core changes get unit coverage (SSRF, org index, dataset keys, rate limit concurrency, webhook SHA, status map, heuristic registry).
- UI extraction (P1-5) gets RTL via role/name queries.

## Risks

- P1-4 reduces CI signal for some WCAG criteria — intentional; kept checks remain actionable `needs_review` producers.
- Absolute-route rejection may break callers that intentionally passed full URLs — accepted; contract is path-under-base.
- Rate-limit SQL shape must preserve window-reset behavior under the existing advisory lock.

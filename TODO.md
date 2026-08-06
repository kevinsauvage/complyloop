# Production Readiness TODO

Master implementation roadmap to take ComplyLoop from a strong single-tenant MVP to a
commercial, multi-tenant SaaS. Scope reviewed: `src/app`, `src/components`, `src/server`,
`src/core`, `src/analysis`, `src/adapters`, `src/ai`, `packages/check`, docs, CI, deps.

Effort legend: 🟢 Small (<2h) · 🟡 Medium (2–8h) · 🟠 Large (1–3d) · 🔴 Very large (>3d)

> Context that shapes every priority below: the product is architected as a **single
> shared JSON/JSONB "whole-Db" document** loaded and rewritten on every request, with a
> **global `activeProjectId`** and several **unscoped read paths**. Mutations are RBAC-guarded,
> but reads and one connect action are not. That combination is the core blocker for selling
> to more than one customer.

---

## 🔴 P0 — Must Fix Before Launch

Issues that could prevent the product from being safely or professionally sold.

- [x] **Multi-tenant read isolation: findings, evidence, exports leak across tenants** 🟠
  - **Problem:** Read paths load the entire store and never filter by the viewer's visible projects. A signed-in user can read any tenant's compliance data by URL or export.
  - **Why:** Direct confidentiality breach. For a compliance product, leaking one customer's findings/evidence to another is an existential trust and possibly contractual/legal failure.
  - **Location:** `src/app/findings/[id]/page.tsx:174-176` (loads any finding by id, no `isProjectVisible`); `src/app/evidence/page.tsx:7-8` (`[...db.evidence]` unscoped); `src/app/evidence/export/route.ts:12-13`; `src/app/evidence/report/route.ts:23`; `src/app/evidence/report/html/route.ts:26`.
  - **Recommendation:** Introduce a helper that returns evidence/findings filtered to `visibleProjects(db, access)` for the current session, and use it on every read page and every `route.ts` download. On finding detail, resolve the finding, then assert `isProjectVisible(project, access)` (reuse `project-visibility.ts`) → `notFound()` otherwise.
  - **Acceptance criteria:** A user in org A cannot load org B's finding detail, evidence rows, JSON export, or report; automated test covers the negative case for each surface.

- [x] **Unauthenticated `connectProjectAction` = arbitrary path/URL connect on a hosted deploy** 🟡
  - **Problem:** `connectProjectAction` takes a `target` form field and calls `connectProjectInput` (local path or git URL) with no `auth()` / permission check. `connectLocalPath` does `path.resolve(target)` against the host filesystem; git URL triggers a server-side clone.
  - **Why:** On any hosted instance this lets an anonymous visitor mount arbitrary server directories as a "project" and, combined with remediation apply, read/write files outside intended scope (SSRF-adjacent for the git clone path too).
  - **Location:** `src/server/actions.ts:147-168`; `src/server/connect.ts:104-135` (`connectLocalPath` resolves any host path); `connect.ts:141-193` (`connectGitUrl`).
  - **Recommendation:** Require a session + `project.connect` permission on an active org before connecting. Disable the raw local-path connector in hosted mode (gate behind an env flag that is off by default); keep it only for the local laptop demo. Validate/deny-list git URL hosts and internal IP ranges before clone.
  - **Acceptance criteria:** Anonymous connect returns an auth error in hosted mode; local-path connect is unavailable unless an explicit "local mode" flag is set; clones to private/link-local addresses are rejected.

- [ ] **Path containment on remediation apply and PR write** 🟡
  - **Problem:** File writes use `path.join(project.rootPath, finding.location.filePath)` with no check that the resolved path stays under `rootPath`. A `../` in a stored/poisoned `filePath` writes outside the workspace.
  - **Why:** Arbitrary file write on the server; also risks corrupting unrelated files.
  - **Location:** `src/server/actions.ts:464-466`; `src/server/pr.ts:75-86`; `src/server/assessment.ts` file reads.
  - **Recommendation:** Add a single `resolveInside(root, relative)` helper that resolves and asserts the result starts with `root + path.sep`; throw otherwise. Use it everywhere the app reads/writes a project file.
  - **Acceptance criteria:** A finding with `location.filePath = "../../etc/x"` is rejected before any read/write; unit test covers containment.

- [ ] **PR apply uses stale spans and can corrupt customer source** 🟡
  - **Problem:** `preparePullRequest` calls `applyFix(original, finding.fix)` with the *stored* span, without the re-scan/`locateViolation` safeguard the in-app apply path uses. If the file drifted since detection, the fix inserts/removes at the wrong offset.
  - **Why:** Silently corrupting a customer's source in an automated PR is a severe trust failure and hard to detect.
  - **Location:** `src/server/pr.ts:75-86`; contrast the safe path `src/server/actions.ts:105-119` (`locateViolation`) and `449-466`.
  - **Recommendation:** Re-locate the violation in `pr.ts` (reuse `locateViolation` + `mergeFix`) before writing; if it can't be re-located, refuse to open the PR with a clear message. Optionally re-run the check on the fixed file before commit.
  - **Acceptance criteria:** PR generation on a drifted file either applies at the correct current offset or aborts; test simulates drift.

- [ ] **`@complyloop/check` is not installable — the advertised CI story is broken** 🟠
  - **Problem:** The customer-facing CI package is `"private": true`, ships only `bin.js` + README, and `bin.js` resolves `../../src/cli/check.ts` via monorepo `tsx` and the full workspace `src/analysis`. `npx complyloop-check` / installing `@complyloop/check` will fail outside this repo.
  - **Why:** CI gating is a core selling point (README, templates). Selling a package that cannot be installed is a launch blocker.
  - **Location:** `packages/check/package.json`; `packages/check/bin.js:12-25`; `src/cli/check.ts`; `templates/github-actions/complyloop-check.yml`.
  - **Recommendation:** Build a self-contained, bundled artifact (e.g. tsup/esbuild) that inlines the analysis engine and its runtime deps (`typescript`), drop `private`, set correct `files`/`bin`/`exports`, and add a publish workflow. Until then, update README/templates to stop implying `npm i @complyloop/check` works.
  - **Acceptance criteria:** `npm pack` produces a tarball that runs `complyloop-check .` in a clean directory with no workspace present; a smoke test installs the packed tarball and runs it.

- [ ] **Global `activeProjectId` is shared across all users** 🟡
  - **Problem:** Active project is a single value in `app_meta` / the JSON root, not per-user. Two concurrent users overwrite each other's context, and actions that operate on "the active project" can act on the wrong tenant's project.
  - **Why:** Correctness and isolation bug that gets worse with every additional user; can cause a user to assess/remediate another org's project.
  - **Location:** `src/server/db-store/postgres.ts:20,89-95,444-453`; `src/server/workspace.ts:84-95`.
  - **Recommendation:** Move active project selection to a per-user cookie/session (mirror the existing `active-org.ts` cookie pattern) and resolve it within the viewer's visible projects.
  - **Acceptance criteria:** Two users hitting the app concurrently keep independent active projects; no shared write to `app_meta.activeProjectId`.

- [ ] **`error.tsx` / `not-found.tsx` are missing; most mutations throw raw errors** 🟡
  - **Problem:** There are zero route-level `error.tsx`/`not-found.tsx` files, and most server actions `throw new Error(...)`. Failures surface as Next's default digest screen instead of an in-product recovery path.
  - **Why:** A paying user hitting a raw error page looks broken and loses trust; they get stuck with no next step.
  - **Location:** entire `src/app/`; throws in `src/server/actions.ts` (e.g. `455-462`, `536`, `686`, `741-748`).
  - **Recommendation:** Add a root `app/error.tsx` and `app/not-found.tsx` with recovery UI; convert user-triggerable throws in actions to typed form-state errors surfaced in the UI (extend the `useActionState` pattern already used by connect/invite).
  - **Acceptance criteria:** A forced action failure renders an in-app error with a retry/back path, not the Next digest screen.

- [ ] **Durable workspace strategy before any multi-instance / serverless deploy** 🟠
  - **Problem:** Clones live on local disk under `$DATA_DIR/workspaces`; another instance can't see them and serverless disks are ephemeral. Webhook re-assessment hard-fails when the workspace path is missing.
  - **Why:** The moment you scale past one long-lived node (the default for real SaaS), continuous monitoring and remediation silently break.
  - **Location:** `src/server/db.ts:25-27`; `src/server/connect.ts:68-74`; `src/server/webhook.ts:153-158`; documented in `docs/deploy.md:14-16,63-64`.
  - **Recommendation:** For launch, pin deployment to a single instance with a durable volume and document it as a hard requirement. Track a follow-up to clone-per-job into ephemeral storage or object storage so horizontal scaling is possible.
  - **Acceptance criteria:** Deploy runbook states the single-instance + durable-disk constraint explicitly; webhook path returns a clear, monitored error (not a crash) when a workspace is missing.

- [ ] **No error tracking / monitoring anywhere** 🟡
  - **Problem:** No Sentry/OTel/structured logger under `src/`. Several failures are swallowed (`catch { return null }`) with no signal.
  - **Why:** In production you will be blind to auth failures, corrupt-store recoveries, webhook failures, and PR/clone errors — you cannot operate a paid service this way.
  - **Location:** `src/ai/explainer.ts:61-63`; `src/ai/remediation.ts:65-67`; `src/server/github-tokens.ts:88-91,104-108`; `src/server/webhook.ts:26-28`.
  - **Recommendation:** Add error tracking (Sentry is already available as a plugin/skill here) at the app boundary + server actions + webhook route; log-and-rethrow in the currently-silent catches with enough context to diagnose.
  - **Acceptance criteria:** A thrown server action and a failed webhook both produce a captured error event with request/tenant context.

---

## 🟠 P1 — Important Before Launch

Important for quality, security, maintainability, UX, or reliability.

- [ ] **Dev-only auth secret fallback can silently ship to production** 🟢
  - **Problem:** `secret: process.env.AUTH_SECRET ?? "dev-only-auth-secret-not-for-production"`. If `AUTH_SECRET` is unset in prod, sessions and encrypted tokens use a known constant.
  - **Why:** Anyone can forge sessions / decrypt tokens; catastrophic if it reaches prod.
  - **Location:** `src/auth.ts:49`.
  - **Recommendation:** In production, throw when `AUTH_SECRET` is missing (you already have `assertProductionAuthUrl`; add the same guard for the secret) instead of falling back.
  - **Acceptance criteria:** Production boot fails loudly without `AUTH_SECRET`; dev is unaffected.

- [ ] **Webhook idempotency is check-then-act (TOCTOU)** 🟡
  - **Problem:** The route checks `hasProcessedWebhookDelivery` then later `recordWebhookDelivery`; two concurrent deliveries of the same id can both pass the check and both re-assess.
  - **Why:** Duplicate assessments, duplicate alerts, wasted compute; races worsen under load.
  - **Location:** `src/app/api/github/webhook/route.ts:28-45`; `src/server/webhook-deliveries.ts:72-104`.
  - **Recommendation:** Atomic claim: `INSERT ... ON CONFLICT DO NOTHING` and only process when a row was inserted. Apply the same for the JSON fallback under the write lock.
  - **Acceptance criteria:** Two parallel identical deliveries result in exactly one assessment; test covers the concurrent case.

- [ ] **Over-broad `repo` OAuth scope** 🟡
  - **Problem:** OAuth requests `repo` (full read/write to all of a user's repos) for every user, even those only assessing one public repo.
  - **Why:** Excessive permissions are a security and trust liability; enterprises will reject it in review.
  - **Location:** `src/auth.ts:41-45`; noted in `docs/deploy.md:57`.
  - **Recommendation:** Move to a GitHub App with least-privilege, per-repo installation permissions before multi-tenant launch (already flagged as the intended path in code comments).
  - **Acceptance criteria:** Connecting a repo grants access only to selected repos; scope is documented and minimal.

- [ ] **`sslmode=require` disables cert verification** 🟢
  - **Problem:** Postgres URL handling maps `sslmode=require` to `rejectUnauthorized: false`.
  - **Why:** MITM risk on the DB connection in production.
  - **Location:** `src/server/db-store/postgres-url.ts:20-22`.
  - **Recommendation:** Default to verified TLS (`verify-full`) for managed Postgres; only relax with an explicit, documented opt-in.
  - **Acceptance criteria:** Prod DB connections verify the server certificate by default.

- [ ] **Action feedback: pending/success/error missing on most mutations** 🟠
  - **Problem:** Only connect / GitHub picker / invite / create-org / create-PR use `useActionState`. Run assessment, approve/apply/verify/dismiss, requirement imports, and remove-member are bare `<form action>` with no pending/disabled/success state → double-submit and no confirmation.
  - **Why:** Users can't tell if an action worked; double-submits cause duplicate writes; feels unfinished.
  - **Location:** `src/app/page.tsx:111-127`; `src/app/findings/[id]/page.tsx:67-151`; `src/app/requirements/page.tsx:58-66`; `src/app/org/page.tsx:96-109`.
  - **Recommendation:** Standardize a small submit-button component using `useFormStatus` for pending/disabled, and surface success via `role="status"`. Apply across all mutating forms.
  - **Acceptance criteria:** Every mutating form disables during submit and shows a success or error message afterward.

- [ ] **Failed automated verification is nearly invisible** 🟡
  - **Problem:** When re-check still finds the violation, status stays `implemented` and a note is pushed into collapsed history; no visible alert.
  - **Why:** Users believe "verify" did nothing and get stuck mid-loop — the core product loop breaks for them.
  - **Location:** `src/server/actions.ts:492-499`; UI `src/app/findings/[id]/page.tsx:121-152,353-365`.
  - **Recommendation:** Return a typed outcome and render a prominent `role="alert"` ("Still failing — the violation is still detected") on failed verification.
  - **Acceptance criteria:** A failed verify shows an explicit, announced message; test asserts the message appears.

- [ ] **RBAC not reflected in UI (viewers see actions that will throw)** 🟡
  - **Problem:** Viewers see Approve/Apply/Run assessment/Dismiss; the server throws "Not allowed". No disabled states or role-aware copy.
  - **Why:** Confusing dead-end UX; makes the permission model feel broken.
  - **Location:** finding ActionPanel + dashboard buttons vs `src/core/rbac.ts:11-12`.
  - **Recommendation:** Pass the viewer's permissions to pages and hide/disable actions the role can't perform, with explanatory copy.
  - **Acceptance criteria:** A viewer sees read-only UI with no throwing action buttons.

- [ ] **No global project/org context on Findings/Evidence/Requirements** 🟡
  - **Problem:** Active project switcher only exists on the dashboard; other pages give no indication of which project/org you're acting on.
  - **Why:** Users can act on the wrong project without realizing it — dangerous once multiple projects exist.
  - **Location:** switchers only in `src/app/page.tsx:130-141` and `src/app/org/page.tsx:65-67`.
  - **Recommendation:** Move project + org context/switcher into the layout so it's always visible; show current project in each `PageHeader`.
  - **Acceptance criteria:** Every workflow page shows the active project/org and lets the user switch.

- [ ] **Pagination for unbounded lists (findings, evidence, requirements, history)** 🟠
  - **Problem:** No pagination anywhere; pages hydrate the full store and render entire arrays. Evidence is append-only and never pruned, so it grows forever.
  - **Why:** Memory/render/IO blow up as real projects accumulate months of assessments; pages get slow then unusable.
  - **Location:** `src/app/findings/page.tsx`; `src/app/evidence/page.tsx:54-66`; `src/app/requirements/page.tsx:212-396`; store load in `src/server/db.ts:68-79`.
  - **Recommendation:** Add server-side pagination/limits for evidence and findings; longer term, query by tenant/project instead of hydrating the whole store (see Architecture).
  - **Acceptance criteria:** Evidence and findings pages render a bounded page size with next/prev and stay responsive with 10k+ evidence rows.

- [ ] **Confirmation on destructive/disk-mutating actions** 🟢
  - **Problem:** Reset sample, Apply change (writes to disk), Remove member, Dismiss finding fire on a single click with no confirmation.
  - **Why:** Easy accidental data/file changes; member removal and applying fixes are hard to undo.
  - **Location:** `src/app/page.tsx:111-118`; `src/app/findings/[id]/page.tsx:94-97,376-406`; `src/app/org/page.tsx:96-109`.
  - **Recommendation:** Add a confirm step (native dialog or a small confirm component) for destructive actions.
  - **Acceptance criteria:** Each destructive action requires explicit confirmation.

- [ ] **`getWorkspace()` not memoized → duplicate loads + double `auth()` per request** 🟡
  - **Problem:** Dashboard calls `getWorkspace()`, then `ConnectProjectPanel` calls it again, and `auth()` runs in the panel, the layout, and the workspace loader — a per-request waterfall of full-store loads.
  - **Why:** Every page pays 2–3× the store/auth cost; scales badly and adds latency.
  - **Location:** `src/app/page.tsx:65`; `src/components/connect-project-panel.tsx:14-23`; `src/app/layout.tsx` → `auth-controls.tsx:14`; `src/server/workspace.ts:113-138`.
  - **Recommendation:** Wrap `getWorkspace` (and a session getter) in `React.cache` so a request computes them once.
  - **Acceptance criteria:** A single page render loads the store and session once each.

- [ ] **`aria-hidden={false}` false positive in the analysis engine** 🟢
  - **Problem:** `stringValueOf` returns `undefined` for the `{false}` expression, and the check treats `value === undefined` as hidden, flagging `aria-hidden={false}` as a violation. `form-error-association` handles `FalseKeyword` correctly; this check doesn't.
  - **Why:** The product's own accessibility engine emitting false positives undermines the core value proposition and erodes user trust.
  - **Location:** `src/analysis/checks/aria-hidden-focusable.ts:19-27`; contrast `src/analysis/checks/form-error-association.ts:13-31`.
  - **Recommendation:** Treat explicit `FalseKeyword` / `{false}` as not-hidden; only flag boolean-shorthand or `"true"`. Add a regression test.
  - **Acceptance criteria:** `<button aria-hidden={false} />` produces no finding; test covers it.

- [ ] **Programmatic form-error association on our own forms** 🟡
  - **Problem:** Forms show `role="alert"` blocks but don't wire `aria-invalid` / `aria-describedby` to inputs — the exact pattern the product's `form-error-association` check flags in customers' code.
  - **Why:** Credibility: the accessibility product should pass its own checks. Also a real screen-reader gap.
  - **Location:** `src/components/connect-project-form.tsx:31-34`; `src/components/invite-member-form.tsx:59-63`; finding/requirements forms.
  - **Recommendation:** Add `aria-invalid` + `aria-describedby` linking inputs to their error text.
  - **Acceptance criteria:** Invalid fields expose their error to assistive tech via `aria-describedby`.

- [ ] **Color contrast: `text-zinc-400` fails WCAG AA** 🟢
  - **Problem:** `text-zinc-400` (~2.5:1 on white) is used for timestamps, footer, muted meta.
  - **Why:** Same credibility gap — the a11y product must meet AA. Real low-vision impact.
  - **Location:** `src/app/layout.tsx:43`; `src/app/findings/page.tsx:110`; many pages.
  - **Recommendation:** Use `zinc-500`+ for text on light backgrounds (≥4.5:1).
  - **Acceptance criteria:** All body/meta text meets AA contrast.

- [ ] **Skip link + focus management** 🟢
  - **Problem:** No skip-to-main link; sidebar-first tab order on every page; no focus move after navigation/actions.
  - **Location:** `src/app/layout.tsx:29-51`.
  - **Recommendation:** Add a skip link to `<main>`; move focus to the page `<h1>` on route change/action completion.
  - **Acceptance criteria:** Keyboard users can skip nav; focus lands sensibly after actions.

- [ ] **Mobile / responsive layout** 🟡
  - **Problem:** Fixed `w-60` sidebar, no mobile nav or collapse.
  - **Why:** Broken/cramped on phones and small windows; reviewers and buyers will notice.
  - **Location:** `src/app/layout.tsx:30-47`.
  - **Recommendation:** Responsive nav (collapsible drawer) and fluid main content.
  - **Acceptance criteria:** App is usable at 375px width.

- [ ] **Tests for `actions.ts` (approve/apply/verify/dismiss) and action-level authz** 🟠
  - **Problem:** The 1088-line action layer — the largest and most security-sensitive surface — has essentially no direct tests; the permission matrix is untested.
  - **Why:** Regressions here corrupt state or bypass RBAC; this is business-critical behavior.
  - **Location:** `src/server/actions.ts`; `src/auth.ts`.
  - **Recommendation:** Add tests exercising the remediation lifecycle actions (including verify-failure) and a permission matrix (viewer/member/admin/owner × action).
  - **Acceptance criteria:** Each action has a happy-path test and a denied-permission test.

- [ ] **Webhook end-to-end test** 🟡
  - **Problem:** Only signature verification is unit-tested; the route → pull → reassess → alert flow is untested.
  - **Why:** Continuous monitoring is a headline feature and touches disk, git, and the store.
  - **Location:** `src/server/webhook.ts`; `src/app/api/github/webhook/route.ts`.
  - **Recommendation:** Integration test with a fake repo + signed payload asserting reassessment + regression alert + idempotency.
  - **Acceptance criteria:** A signed push/PR payload drives a full reassessment in test.

- [ ] **AI explanations missing `confidence`; AI failures swallowed** 🟢
  - **Problem:** AI remediations carry `confidence` but explanations don't, violating `.cursor/rules/ai-features.mdc`; AI errors are silently `null`.
  - **Location:** `src/ai/explainer.ts:7-11,56-63`; `src/ai/remediation.ts:65-67`.
  - **Recommendation:** Add `confidence` to explanation schema/UI; log AI failures via the new error tracking.
  - **Acceptance criteria:** AI explanations display confidence; AI failures are captured.

- [ ] **Legal + product surfaces for a paid SaaS** 🟡
  - **Problem:** No Terms of Service, Privacy Policy, data-processing/subprocessor info, or in-app links to them; nothing describing data handling for a product that ingests customers' source and stores compliance evidence.
  - **Why:** Required for B2B sales and for handling source code / audit data; procurement will block without it.
  - **Location:** app chrome (`src/app/layout.tsx`); no legal routes exist.
  - **Recommendation:** Add ToS/Privacy pages and footer links; document data retention and deletion; describe what is cloned and stored.
  - **Acceptance criteria:** ToS/Privacy reachable from the app; data-handling documented.

---

## 🟡 P2 — Post-Launch Improvements

- [ ] **Escape the whole-Db read-modify-write model** 🔴
  - **Problem:** Every request hydrates all tenants' data; every write rewrites all mutable tables; one global advisory lock serializes all tenants' writes; the JSONB "payload" model requires a ~450-line hand-written upsert/delete.
  - **Why:** Hard scaling ceiling and high maintenance risk; a missed table in the persist code corrupts state.
  - **Location:** `src/server/db.ts:29-65`; `src/server/db-store/postgres.ts:60-454`; `src/server/db-store/write-lock.ts:8-35`.
  - **Recommendation:** Migrate to real relational tables with per-project/tenant queries, append evidence directly, and replace the global lock with row/tenant-scoped transactions. (See Architecture.)
  - **Acceptance criteria:** Reads/writes are scoped to a tenant and don't load unrelated data; no single global write lock.

- [ ] **Foreign keys + referential integrity in Postgres** 🟡
  - **Problem:** No FKs/cascades; integrity depends on "rewrite from memory". Alerts aren't removed on disconnect; evidence is retained (correct) but unbounded.
  - **Location:** `src/server/db-store/schema.ts`; disconnect in `src/server/connect.ts:365-398`.
  - **Recommendation:** Add FKs + unique constraints (`requirements (project_id, control_id)`), and clean up orphaned alerts on disconnect.
  - **Acceptance criteria:** DB rejects orphaned rows; disconnect leaves no dangling alerts.

- [ ] **Transactional migration runner** 🟢
  - **Problem:** Applying SQL and recording it in `_complyloop_migrations` aren't in one transaction; a crash between them leaves inconsistent bookkeeping.
  - **Location:** `scripts/db-migrate.ts:42-55`.
  - **Recommendation:** Wrap each migration's apply + record in a single transaction.
  - **Acceptance criteria:** A mid-migration crash leaves the migration either fully applied+recorded or not at all.

- [ ] **Account & org management UI for SaaS** 🟠
  - **Problem:** Only sign-in/out and a minimal org page exist. No change-member-role, transfer/leave org, invite revoke, org rename/delete, account/profile/security settings, or project settings.
  - **Location:** `src/app/org/page.tsx`; `src/components/*`.
  - **Recommendation:** Build account and org settings surfaces incrementally; start with change-role and invite revoke (both are natural extensions of existing actions).
  - **Acceptance criteria:** Admins can manage roles and invites from the UI.

- [ ] **Rate limiting on webhook + auth + connect endpoints** 🟡
  - **Problem:** No rate limiting anywhere; webhook and connect trigger clones/assessments (expensive).
  - **Location:** `src/app/api/github/webhook/route.ts`; connect actions.
  - **Recommendation:** Add per-IP/per-token rate limits on the webhook and connect/assess paths.
  - **Acceptance criteria:** Abusive request volume is throttled with 429s.

- [ ] **Shorten lock hold times (no network under the write lock)** 🟡
  - **Problem:** AI generation and the webhook Check Run HTTP call happen while holding the store write lock, blocking all other writers.
  - **Location:** `src/server/actions.ts:558-619`; `src/server/webhook.ts:177-226`.
  - **Recommendation:** Do network I/O outside the lock; take the lock only to persist results.
  - **Acceptance criteria:** No outbound HTTP occurs while the write lock is held.

- [ ] **Split god files** 🟡
  - **Problem:** Files well over the ~300-line guideline: `actions.ts` (1088), `postgres.ts` (454), `findings/[id]/page.tsx` (429), `assessment.ts` (424), `connect.ts` (406), `requirements/page.tsx` (399), `types.ts` (343), `page.tsx` (321).
  - **Recommendation:** Split `actions.ts` by domain (remediation / org / requirements / connect); extract finding-detail and requirements sub-components.
  - **Acceptance criteria:** No non-types module exceeds ~300 lines without justification.

- [ ] **Toast/flash feedback after redirects** 🟢
  - **Problem:** No cross-navigation success feedback after actions that revalidate/redirect.
  - **Recommendation:** Add a lightweight flash mechanism (searchParams or cookie) surfaced as a toast.
  - **Acceptance criteria:** Post-action success is visible after navigation.

- [ ] **Onboarding flow for signed-in tenants** 🟡
  - **Problem:** Onboarding is demo-first (sample project + always-on connect panel); no guided connect → scope → assess → first finding for a real tenant.
  - **Location:** `src/app/page.tsx:143-156`; `src/app/org/page.tsx:40-48`.
  - **Recommendation:** Add a first-run checklist for signed-in users with no real project yet.
  - **Acceptance criteria:** A new tenant is guided to their first assessment.

---

## 🟢 P3 — Nice to Have

- [ ] **Findings search / filter (severity, control, file)** 🟡 — only status sections today (`src/app/findings/page.tsx`).
- [ ] **Move `activeProjectId` magic + `dataDir()` duplication into shared helpers** 🟢 — duplicated in `json.ts`, `github-tokens.ts`, `webhook-deliveries.ts`.
- [ ] **`CheckId` boundary leak** 🟢 — `src/adapters/rgaa/guidance.ts:1` imports `CheckId` from `@/analysis`; move the id type to core.
- [ ] **Broaden check coverage** 🟡 — `button-name`/`input-label` only match native tags, not `role="button"` / `select` / `textarea`; `iframe`/`aria-hidden` with dynamic expressions.
- [ ] **Git hooks (pre-commit lint/typecheck)** 🟢 — no husky/lint-staged; gate is CI + manual only.
- [ ] **Stricter tsconfig flags** 🟢 — add `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- [ ] **Import-boundary lint (core ↔ adapters/analysis)** 🟢 — enforce dependency direction with a rule.
- [ ] **EmptyState/brand headings** 🟢 — `EmptyState` title is a `<p>`; brand mark is a non-link `<p>` (`src/app/layout.tsx:32-36`; `src/components/ui.tsx:56-61`).

---

# Architecture Improvements

### 1. Tenant-scoped persistence (replace whole-Db RMW)
- **Current architecture:** One logical document (JSON file or a set of JSONB `payload` tables) is loaded in full on every request and rewritten in full on every mutation, serialized by a single global advisory lock. `activeProjectId` is a single global value.
- **Problem:** No query-level tenant isolation; unbounded memory growth (evidence); global lock serializes all tenants; ~450 lines of hand-written persist logic that can silently drop a table.
- **Proposed architecture:** Normalized relational schema with foreign keys; queries scoped by `orgId`/`projectId`; evidence appended (and paginated) directly; per-tenant/row transactions instead of one global lock; per-user active-project in session.
- **Migration strategy:** Keep the `Db`-shaped facade for the domain/assessment code initially; behind it, replace whole-store load/save with scoped repository functions table by table (start with evidence + findings reads, then writes). Dual-run against the JSON store in tests during the transition.
- **Priority:** P2 (the read-isolation *symptoms* are fixed as P0 patches first; this is the durable fix).

### 2. GitHub App instead of broad OAuth `repo` scope
- **Current:** OAuth with `repo` scope; user token stored (encrypted) and reused for clone/pull/PR/Check Runs.
- **Problem:** Excessive standing permissions across all of a user's repos; enterprise procurement blocker.
- **Proposed:** GitHub App with per-repo installation and least-privilege permissions; installation tokens minted on demand.
- **Migration strategy:** Add App auth alongside OAuth; migrate connect/webhook/PR to installation tokens; deprecate the broad scope.
- **Priority:** P1 for launch credibility, P2 for full migration.

### 3. Durable/ephemeral clone strategy
- **Current:** Persistent clones on local disk; single-instance assumption.
- **Problem:** Blocks horizontal scaling and serverless; webhook fails when disk is cold.
- **Proposed:** Clone-per-job into ephemeral storage (or sparse fetch of changed files) so no long-lived shared disk is required.
- **Migration strategy:** Introduce a workspace provider interface; keep the disk provider for local, add an ephemeral provider for hosted.
- **Priority:** P0 constraint (document single-instance) now; P2 for the real fix.

---

# Technical Debt

- `actions.ts` at 1088 lines mixes many domains; high review risk for permission bugs.
- JSONB document store requires ~450 lines of manual upsert/delete (`postgres.ts`) — brittle, easy to miss a table.
- Duplicated helpers: `dataDir()` (3 modules), `hasAriaName` (3 checks), near-twin GitHub/git clone paths.
- `saveDb` remains a public unlocked API — easy to misuse outside the write lock.
- `next-auth` pinned to `^5.0.0-beta.32` (beta) — breaking-change exposure; plan to pin exactly and track upstream to GA.
- Requirement statuses have no explicit transition graph in core (derived ad hoc in assessment/actions).
- Migration runner is a custom ordered-SQL applier (fine for now, not journaled like Drizzle Kit).

---

# Security Findings

**Critical**
- Cross-tenant read leak: findings detail, evidence page, JSON export, MD/HTML reports (P0).
- Unauthenticated `connectProjectAction` → arbitrary local path connect + server-side clone (P0).
- Path traversal on remediation apply / PR write (P0).

**High**
- Dev-secret fallback for `AUTH_SECRET` can reach production (`src/auth.ts:49`).
- Global `activeProjectId` cross-user contamination.
- Webhook idempotency TOCTOU (duplicate processing).
- Over-broad `repo` OAuth scope.

**Medium**
- `sslmode=require` → `rejectUnauthorized: false` (DB MITM).
- Silent token/store decrypt/parse failures look like "logged out" and hide tampering.
- Local-path connector exposes host filesystem if enabled in a shared deployment.
- No rate limiting on webhook/connect/auth.

**Low**
- Empty catches around non-fatal git/PR cleanup reduce diagnosability.
- No structured logging/APM to detect abuse.

_(No SQL injection found — Drizzle parameterizes; no `dangerouslySetInnerHTML`; git env is sanitized in `src/server/git.ts`; webhook HMAC verification and AES-256-GCM token encryption are correctly implemented.)_

---

# Performance Findings

- Full-store hydrate on every page/request; no query-level scoping (`getWorkspace`/`loadDb`).
- No pagination on findings, evidence, requirements, remediation history.
- Duplicate `getWorkspace()` + `auth()` per request (no `React.cache`).
- O(controls × findings) loops in requirements/assessment; O(n²) cluster resolution in findings list.
- Every page `force-dynamic`; no static/ISR/caching for read-mostly views.
- Evidence append-only and never pruned → grows unbounded and is loaded in full each time.

---

# Accessibility Findings

**High**
- `text-zinc-400` body/meta text fails WCAG AA contrast (multiple pages).
- Form errors not programmatically associated (`aria-invalid`/`aria-describedby`) — ironic vs the product's own check.
- No skip link; sidebar-first tab order.
- Async outcomes (failed verify, "Copied") not announced via live regions.

**Medium**
- `EmptyState` title and brand mark are `<p>`, weakening the heading outline.
- Remediation lifecycle inactive steps rely on low-contrast `text-zinc-400`.
- No focus management after navigation/actions.
- `aria-hidden={false}` false positive in the engine (also a correctness bug).

**Done well:** `lang="en"`, `<nav aria-label>` + `aria-current`, `<main>` landmark, semantic evidence table with `scope="col"`, labeled connect/invite/scope forms, provenance badges, `role="status"` on PR success.

---

# Testing Gaps

Most important missing coverage (business-critical / high-risk first):
1. `src/server/actions.ts` remediation lifecycle (apply/verify incl. failure) + RBAC permission matrix.
2. Auth/session behavior and action-boundary authorization.
3. Webhook end-to-end (route → pull → reassess → alert → idempotency).
4. Multi-tenant read isolation (finding detail, evidence, exports) — negative tests.
5. Path containment on apply/PR.
6. `aria-hidden={false}` regression + dynamic-expression cases across checks.
7. E2E happy path of the full loop (connect → assess → finding → remediate → verify → evidence) — none exist.
8. Postgres load/persist + advisory-lock integration (currently only JSON round-trip).

_(Well covered already: domain core + transitions, per-check AST behavior, assessment stickiness/regressions, connect/disconnect, token encryption, webhook signature, orgs/RBAC helpers, monitor diffs, report markdown.)_

---

# Production Checklist

- [ ] **Authentication** — remove dev-secret fallback in prod; keep `AUTH_URL` guard; plan GitHub App migration.
- [ ] **Authorization** — add missing read-path visibility checks (finding detail, evidence, exports); reflect RBAC in UI; test the permission matrix.
- [ ] **Security** — path containment; connect-action auth; rate limiting; verified DB TLS; least-privilege GitHub scope.
- [ ] **Validation** — enforce required notes/expiry client + server; validate/deny-list git URLs; contain file paths.
- [ ] **Error handling** — add `error.tsx`/`not-found.tsx`; convert throwing actions to surfaced errors; stop swallowing failures.
- [ ] **Logging** — structured logging with tenant/request context; log currently-silent catches.
- [ ] **Monitoring** — error tracking (Sentry) + basic metrics on assessments/webhooks/PRs.
- [ ] **Database** — FKs/constraints; per-tenant queries; evidence pagination; transactional migrations.
- [ ] **Backups** — Postgres backups (and `DATA_DIR` if JSON/clones used); documented restore.
- [ ] **Testing** — actions/authz/webhook e2e + one full-loop E2E.
- [ ] **Accessibility** — AA contrast; skip link; error association; focus management; fix `aria-hidden={false}`.
- [ ] **Performance** — `React.cache(getWorkspace)`; pagination; no network under write lock.
- [ ] **CI/CD** — keep the strong `ci.yml`; add a real publish pipeline for `@complyloop/check`; add git hooks.
- [ ] **Environment configuration** — fail loudly on missing prod secrets; document single-instance + durable-disk requirement.
- [ ] **Documentation** — accurate CI package install story; data-handling/retention docs.
- [ ] **UX** — action feedback everywhere; surface failed verify; confirmations; onboarding.
- [ ] **Mobile** — responsive nav and layout.
- [ ] **Legal/product** — ToS, Privacy, data-processing info, in-app links.

---

# Launch Recommendation

### Current readiness

**❌ Not ready**

The engineering foundation is genuinely good for an MVP — a clean framework-agnostic
domain core with exhaustive typed status handling, enforced remediation transitions,
append-only evidence, HMAC-verified idempotent webhooks, AES-256-GCM token encryption,
a real CI quality gate, and unusually accurate docs. The product loop
(assess → explain → remediate → verify → evidence) works end to end.

But it is architected as a **single shared workspace**, not a multi-tenant SaaS. Any
signed-in user can read other tenants' findings, evidence, and exports; one connect action
is unauthenticated and can mount arbitrary server paths; automated PR fixes can corrupt
source on file drift; the active project is global; and the advertised CI package cannot be
installed. These are correctness/security/trust failures, not polish. They must be fixed
before charging customers.

### Top 10 priorities (ordered by real impact)

1. **Scope all read paths by tenant** — finding detail, evidence page, JSON export, MD/HTML reports (P0).
2. **Authenticate `connectProjectAction`** and gate/disable the raw local-path connector in hosted mode (P0).
3. **Contain filesystem paths** under `rootPath` on every apply/PR read/write (P0).
4. **Re-locate spans before PR apply** so automated fixes can't corrupt customer source (P0).
5. **Remove the dev `AUTH_SECRET` fallback in production** (P1, but tiny and severe).
6. **Make `@complyloop/check` installable** or stop advertising it (P0 for the CI value prop).
7. **Per-user `activeProjectId`** via session/cookie (P0 correctness).
8. **Add `error.tsx`/`not-found.tsx` + real action feedback** (pending/success/failed-verify) (P0/P1 UX).
9. **Add error tracking + logging** so you can operate the service (P0 ops).
10. **Document and enforce the single-instance + durable-disk deploy constraint**, and add tenant-isolation + actions/authz tests (P0/P1 reliability).

Only after 1–7 are done is this **⚠️ Almost ready**; with 8–10 and the P1 UX/a11y/security
items, it becomes **✅ Ready with minor fixes** for a controlled/private beta. Broad
horizontal scale (the whole-Db rewrite, GitHub App, ephemeral clones) is a post-launch
program, not a launch blocker, provided you pin to a single durable instance at first.

# Decision Log

Record architectural and product-shaping decisions here so AI agents and humans share the same history. Newest first. Keep entries short: context, decision, consequence.

---

## 2026-08-14 — Dependency audit: Sentry 10 + esbuild/nanoid overrides

**Context:** `npm audit --audit-level=moderate` reported OpenTelemetry baggage DoS via `@sentry/node` 9.x, drizzle-kit’s nested `esbuild@0.18` (GHSA-67mh-4wv8-2f99), and `nanoid` < 3.3.18.

**Decision:**
- Upgrade `@sentry/node` to `^10.70.0` (OTel core ≥ 2.8.0). App usage is `init` / `withScope` / `captureException` only — v10 API-compatible.
- `overrides.esbuild` → `$esbuild` (`^0.28.1`) so drizzle-kit’s deprecated `@esbuild-kit/*` chain cannot keep 0.18. Stay on stable `drizzle-kit@0.31` rather than drizzle v1 beta.
- `overrides.nanoid` → `^3.3.18`.

**Consequence:** `npm audit --audit-level=moderate` is clean. Revisit drizzle-kit 1.x when it is stable to drop `@esbuild-kit` entirely.

---

## 2026-08-14 — Database FKs, status checks, and project-scoped indexes

**Context:** Tenant relationships lived as JSONB + text ids. Application filters prevented most orphans, but Postgres would accept invalid statuses and duplicate GitHub identities, and hot-path queries lacked composite indexes.

**Decision:**
- Mutable tables get foreign keys with `ON DELETE CASCADE` (persist still prunes parents before children).
- Evidence has **no** FKs so append-only rows survive project disconnect and org deletion.
- `CHECK` constraints on finding/remediation/requirement status and membership role.
- Unique indexes: org slug (already `0001`); GitHub `fullName` per org and per owner (case-insensitive, from JSONB).
- Requirements gain a `status` column (payload remains canonical) for `(project_id, status)` indexes alongside findings `(project_id, status)` / `(project_id, assessment_id)` and evidence `(project_id, at)`.

**Consequence:** Invalid statuses and orphan mutable rows fail at insert. Query plans for project-scoped findings/requirements/evidence can use the new indexes. Whole-store load still uses `evidence_at_idx`.

---

## 2026-08-07 — Runtime audit SSRF via `ssrf-guard`

**Context:** Runtime preview URLs were validated with a hand-rolled host/IP blocklist. Homegrown IP classification is easy to get wrong (IPv4-mapped IPv6, odd literal forms, CGNAT, etc.).

**Decision:**
- Depend on [`ssrf-guard`](https://www.npmjs.com/package/ssrf-guard) (`isPrivateIp`, `isPublicHostname`, `validateUrl` / `validateResolvedAddresses`).
- Thin adapter in `src/analysis/runtime/url-safety.ts`: product-safe error messages, credential rejection, metadata hostname policy, injectable DNS for tests.
- Playwright `context.route` re-runs the check on every hop (including redirects). Undici IP pinning from `ssrf-guard` does not apply to Playwright; residual DNS-rebinding risk remains.

**Consequence:** IP/hostname classification is maintained upstream. Requires Node.js ≥ 24. Network isolation / preview allowlists remain optional follow-ups.

---

## 2026-08-07 — Postgres-only + ephemeral clone-per-job

**Context:** Dual JSON/`DATA_DIR` persistence blocked multi-instance deploys; durable clones caused `workspace_missing` when disks were ephemeral.

**Decision:**
- Require `DATABASE_URL`; delete the JSON store and all `$DATA_DIR` fallbacks (tokens, webhook deliveries).
- Drop durable `Project.rootPath`. Every job that needs source uses `withRepoCheckout` / `withProjectCheckout` (temp shallow clone → work → delete).
- Connect validates via ephemeral clone then stores GitHub metadata only.

**Consequence:** No workspace volume. Multi-instance OK for app state; jobs still run in-process. Dev requires Postgres (`docker compose` + migrate).

---

## 2026-08-07 — Bind GitHub App installation tokens to the user

**Context:** `connectGitHubRepoAction` minted installation tokens from a client-supplied `installationId` with the App private key — no check that the signed-in user could access that install (cross-tenant clone risk).

**Decision:** Before minting, `resolveUserInstallationForRepo` lists the user’s installations via their OAuth token. A claimed installation id must appear in that list and expose the selected repo; otherwise resolve by scanning the user’s installs. Foreign ids fail with a permission error.

**Consequence:** Installation tokens are only minted for installs the connector can access; the picker may still send `installationId` as a verified hint.

---

## 2026-08-07 — Runtime axe inject from disk (not bundled source)

**Context:** `@axe-core/playwright` injects `axe-core`'s `source` string via `page.evaluate`. Under Next.js the bundler rewrites `typeof module` inside that string, so the browser throws `ReferenceError: module is not defined` at `axeFunction`.

**Decision:** Load `axe-core/axe.min.js` with `page.addScriptTag({ path })` resolved at runtime from `node_modules`, then call `window.axe.run()`. Drop `@axe-core/playwright`.

**Consequence:** Runtime audits work in the Next server; iframe recursion from AxeBuilder is deferred (main frame only for now).

---

## 2026-08-07 — GitHub-only project connect

**Context:** Sample/local/git URL connects complicated multi-tenant security (shared writable sample, arbitrary FS paths) and diluted the primary product path.

**Decision:**
- `ProjectSource` is `"github"` only. Seed frameworks/controls; purge sample/local/git on load.
- Remove local path / git URL connect UI and `ALLOW_LOCAL_PROJECT_CONNECT`.
- Workspace `project` may be `null` until a GitHub repo is connected (sign-in required).

**Consequence:** First run is Sign in with GitHub → pick a repo. CI check package uses `packages/check/testdata`.

---

## 2026-08-07 — Hybrid runtime DOM + AST analysis authority

**Context:** AST-only checks false-positive on design-system primitives (e.g. `<input {...props} />` in `ui/primitives/input.tsx`) because labels live at call sites. Customers need trustworthy failures for selling; auto-fixing primitives with generic `aria-label` is harmful.

**Decision:**
- **Finding locations** are a discriminated union: `source` (AST) | `dom` (runtime).
- **Runtime:** optional project `runtimeBaseUrl` + `runtimeRoutes`; Playwright + axe-core audits rendered pages (`src/analysis/runtime/`).
- **Status authority:** when runtime succeeds, composition-sensitive checks (`input-label`, `button-name`, `anchor-name`, headings, etc.) use DOM findings only; AST findings for those ids are filtered out of assessment merge.
- **AST** remains for local high-precision rules, CI (`complyloop-check`), and auto-fixable source spans. Prop-spreading hosts are never flagged by AST name/label checks.
- **Verification** matches modality: re-axe for `dom`, re-scan file for `source`. DOM findings have no auto-apply patch.

**Consequence:** Preview URL is a first-class project setting. Source-only mode still works for demos; design-system apps get accurate label/name status from the rendered page.

---

## 2026-08-07 — Dark shadcn/ui as the product design system

**Context:** Hand-rolled zinc Tailwind primitives (`ui.tsx`, `action-button-styles`) drifted across pages; the UI felt flat (“card soup”) and used native `confirm`/`select` inconsistently. Spec already allowed adopting shadcn later.

**Decision:**
- Initialize shadcn (radix / new-york-style tokens) under `src/components/ui/`; dark mode by default (`class="dark"` on `<html>`).
- App-level helpers (`PageHeader`, `EmptyState`, `CodeBlock`, `formatDateTime`) live in `page-primitives.tsx` — not a barrel over shadcn.
- Actions use shadcn `Button` variants; destructive gates use `AlertDialog` (no `window.confirm`); permissions use `Alert`.
- Prefer theme tokens (`background`, `muted-foreground`, `border`) over ad-hoc zinc palette classes.

**Consequence:** Product surfaces share one interaction language; custom class-string button helpers are removed. Form fields that must POST (scope checkboxes, dismiss reasons) stay native `<input>`/`<select>` styled to match tokens when Radix primitives do not participate in form submission.

---

## 2026-08-07 — Split god files by domain (no barrels)

**Context:** Several modules exceeded the ~300-line guideline (`actions.ts` ~1.3k, `postgres.ts`, `assessment.ts`, `connect.ts`, finding/requirements/dashboard pages).

**Decision:** Split by domain into defining modules and update imports to those paths — no barrel `index.ts` re-exports. `src/core/types.ts` stays as the type hub (justified exception). Server Actions live under `src/server/actions/{auth,connect,org,remediation*,requirements*,…}.ts`.

**Consequence:** Imports are slightly more specific; file size stays reviewable; Next `"use server"` boundaries stay clear.

---

## 2026-08-06 — GitHub App for least-privilege repo access

**Context:** Classic OAuth `repo` scope grants read/write to every repo the user can access — unacceptable for multi-tenant production.

**Decision:**
- When `GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY` are set, Auth.js requests only `read:user user:email`; the picker lists App installation repos; projects store `github.installationId`; clone/PR/Checks mint installation tokens via `@octokit/auth-app`.
- Production with GitHub auth configured **requires** App credentials (fail loud). Laptop demo may omit App and keep the broad `repo` scope.

**Consequence:** Customers grant access only to selected repos; webhooks/PRs no longer depend on a user’s full-account OAuth token when the project was connected under an App install.

---

## 2026-08-06 — Active org, tokens/webhooks in Postgres, write lock

**Context:** P0 multi-user gaps: `/org` always used personal `defaultOrgIdForUser`; tokens and webhook deliveries still required `$DATA_DIR`; whole-`Db` load/mutate/save raced under concurrent actions + webhooks.

**Decision:**
- **Active org:** HTTP-only cookie `complyloop_active_org` + `resolveActiveOrgId` (preferred membership, else personal owner org). `/org`, invites, removes, and GitHub connect target the active org. `createOrganization` + org switcher; projects on the dashboard are scoped to the active org (unscoped local demos still visible when present).
- **Tokens / webhook deliveries:** when `DATABASE_URL` is set, encrypted GitHub tokens and delivery ids live in Postgres (`github_tokens`, `webhook_deliveries` via migration `0002_tokens_webhooks.sql`). JSON under `$DATA_DIR` remains the laptop fallback. APIs are async. Workspaces/clones stay on disk (P1.9).
- **Multi-writer safety:** `withDbWrite` / `withWorkspaceWrite` serialize writers with an in-process mutex and a Postgres transaction advisory lock around load→mutate→persist. Server actions and webhooks use these helpers instead of bare `loadDb` + `saveDb`.

**Consequence:** Invited admins can manage the shared org; auth/webhook durability no longer needs a shared volume when Postgres is configured; concurrent writers no longer last-clobber each other on a single Node instance (and Postgres multi-instance is locked).

## 2026-08-05 — Orgs / tenants + RBAC

**Context:** Soft `ownerUserId` filtering was not real multi-user ACL; todo P2.13.

**Decision:**
- **Tenants:** `Organization` + `OrgMembership` in the store (JSON + Postgres tables). Sign-in auto-provisions a personal org (role `owner`) and migrates legacy owned projects onto it.
- **Roles:** `owner` | `admin` | `member` | `viewer` with permissions `project.view|assess|remediate|connect` and `org.manage_members` (`src/core/rbac.ts`).
- **Projects:** `project.orgId` is the ACL key; `ownerUserId` remains for GitHub token/webhook lookup. Demo projects without org/owner stay publicly assessable.
- **Invites:** by GitHub login; claimed on next sign-in when `login` matches. UI at `/org`.
- **Actions:** server actions assert the matching permission on the active/finding project before mutating.

**Consequence:** Teammates can share an org with role-scoped access; unscoped local demos still work unsigned when connected.

## 2026-08-05 — Postgres behind `db.ts` with Drizzle

**Context:** JSON `.data/db.json` cannot survive multi-instance or serverless hosts; todo P2.12.

**Decision:**
- **ORM:** Drizzle + `postgres` (postgres.js). Lighter than Prisma for a typed SQL-first boundary; migrations via `drizzle/` SQL + `npm run db:migrate`.
- **Activation:** when `DATABASE_URL` is set, `loadDb`/`saveDb` use Postgres; otherwise keep the JSON file store for the laptop demo.
- **Shape:** callers still use the in-memory `Db` object. Tables hold JSONB `payload` per entity (frameworks, controls, organizations, memberships, projects, requirements, assessments, findings, remediations, alerts) plus typed index columns. `app_meta` stores `activeProjectId`.
- **Evidence:** dedicated `evidence` table; saves **insert only** missing ids — never UPDATE/DELETE evidence rows (append-only at the storage layer).
- **Async boundary:** `loadDb`/`saveDb` are async; server actions / webhook / workspace await them.
- **Still on disk (as of 2026-08-05):** workspaces, encrypted GitHub tokens, webhook delivery ids — tokens/deliveries moved to Postgres on 2026-08-06 when `DATABASE_URL` is set; clones remain on disk.

**Consequence:** Production can put domain state on managed Postgres without rewriting assessment/actions; local demo stays zero-infra JSON.

## 2026-08-05 — P1 depth + light P2 (defer Postgres/orgs)

**Context:** Continuous DX, CI, check depth, prioritization, and light deploy safety without rewriting the store.

**Decision:**
- **CI package:** workspace `@complyloop/check` (`packages/check`) with `complyloop-check` bin; template uses `npx complyloop-check .`. Not published to npm yet.
- **Platform CI:** `.github/workflows/ci.yml` runs lint/typecheck/test/build.
- **Scoped re-scan:** when a previous snapshot exists and JSX/TSX files changed, scan those files only; do not resolve findings outside the changed set; else full tree. `assessment.scanMode` recorded.
- **Checks:** +3 AST rules (duplicate-id, form-error-association, aria-hidden-focusable) → 13 total; autoplay gets `remove_attribute` fix; heading-order/empty-heading guidance strengthened.
- **Priority:** `/findings` open list uses `prioritizeFindings`; controls carry `complianceWeight`.
- **Auth:** require `AUTH_URL` when serving production with GitHub auth (skip Next build phase); clear encrypted tokens on Auth.js `signOut`.
- **Webhooks:** idempotent via `x-github-delivery` → `.data/webhook-deliveries.json`.
- **Postgres / orgs:** still deferred — JSON + soft `ownerUserId` remains.

**Consequence:** Faster continuous loop, clearer CI install, deeper a11y coverage, safer auth/webhooks — without a database rewrite.

## Historical — Initial stack notes (superseded)

Early drafts assumed shadcn/ui, Postgres-first, and axe-core as analysis truth. The shipped MVP uses hand-rolled Tailwind UI, JSON behind `db.ts`, and **TypeScript AST checks** as the deterministic source of truth. Treat those early notes as historical only.

## 2026-08-05 — Prefer maintained packages for infra glue

**Context:** Hand-rolled GitHub `fetch`, recursive `readdirSync` (×3), naive unified diffs, and raw `git` argv wrappers reinvented common tooling.

**Decision:**
- **GitHub HTTP:** `@octokit/rest` for repos / pulls / check runs; `@octokit/webhooks-methods` for signature verify.
- **Diffs:** `diff` (`createTwoFilesPatch`) for developer handoff patches.
- **File walk:** `fast-glob` via shared `src/analysis/source-files.ts` (jsx vs script extension sets).
- **Git clone/PR/webhook pull:** `simple-git`. Tiny sync `git` one-liners in `monitor.ts` stay as `execFileSync` to keep assessment sync.
- **Stay custom:** domain core, AST checks + fixes, assessment stickiness, RGAA adapter, evidence, AES token file store.
- **`typescript`:** moved to `dependencies` (runtime AST analysis).

**Consequence:** Less fragile HTTP/git/diff/walk glue; product loop unchanged.

## 2026-08-05 — Human pass, Check Runs, encrypted tokens, durable deploy

**Context:** P0 gaps: checklist imports stuck on `unable_to_verify`; PR webhooks assessed but did not surface on GitHub; tokens were plaintext on disk; serverless FS cannot host `.data/`.

**Decision:**
- **Human pass:** Manual controls (`checkId === null`) can be marked `passed` with a required note (`requirement.humanPass`). Sticky across assessments the same way as exceptions; evidence kinds `requirement_human_passed` / `requirement_human_pass_cleared`. Automated checks still cannot be human-passed (exceptions remain the override path).
- **Check Runs:** After PR webhook re-assess (`opened` / `synchronize` / `reopened`), post a completed ComplyLoop check run on `pull_request.head.sha` via the Checks API (`src/server/github-checks.ts`).
- **Token encryption:** `.data/github-tokens.json` stores AES-256-GCM ciphertext keyed from `AUTH_SECRET`; plaintext entries migrate on read/write. No disk persistence without `AUTH_SECRET`.
- **Deploy:** Documented in `docs/deploy.md` — require persistent `DATA_DIR` (Fly/Railway/VPS/Docker volume). Ephemeral serverless FS is explicitly unsupported until Postgres (or equivalent) lands.

**Consequence:** Checklist loop closes with human evidence; PRs show pass/fail; tokens are safer to leave on a shared volume; operators know not to put the MVP on bare serverless.

## 2026-08-04 — Continuous GitHub loop, checks, import, prioritization

**Context:** Spec gaps after GitHub connect: webhooks, native PRs, check depth, requirement intake, root-cause/priority. Postgres/multi-tenant listed for when leaving the laptop demo.

**Decision:**
- **Webhooks:** `POST /api/github/webhook` verifies `GITHUB_WEBHOOK_SECRET`, pulls the owned clone with a token stored at sign-in (`.data/github-tokens.json`, now encrypted — see 2026-08-05), re-assesses, and writes `alerts` for regressions.
- **Native PR:** `preparePullRequest` pushes with the OAuth token and opens a PR via GitHub REST (`POST /repos/.../pulls`), not only `gh`.
- **CI:** `.github/workflows/complyloop-check.yml` + `templates/github-actions/` wrapping `npm run check`.
- **Checks:** +4 AST rules (heading-order, empty-heading, iframe-title, autoplay-media) → 10 total; seed migrates new control ids.
- **Import:** framework presets + `CODE | Title | Description` checklist paste.
- **Priority:** `src/core/prioritization.ts` scores severity × confidence × cluster size.
- **Postgres / multi-tenant:** deferred. Keep the `src/server/db.ts` boundary; JSON + soft `ownerUserId` remains until multi-user SaaS needs arrive. No half-migration.

**Consequence:** Continuous re-assess works when a webhook secret + signed-in token exist; engineering PR/CI paths are first-class; a11y credibility and intake improve without a database rewrite.

## 2026-08-04 — Auth.js + GitHub repo connect

**Context:** Spec success requires connecting real software easily; pasting a path/URL is awkward. Users should sign in and pick a GitHub repository.

**Decision:**
- **Auth.js v5** (`next-auth`) with the GitHub provider (`read:user user:email repo`). No global route lock — local/git URL remain available unsigned in development.
- Access token lives in the encrypted JWT; `getGitHubAccessToken()` reads it server-side only. Session exposes `user.id` / `user.login` for UI.
- Connected GitHub projects get `source: "github"`, `ownerUserId`, and soft visibility filtering (unowned demos stay public when present).
- Clone via `https://x-access-token:…@github.com/…` then rewrite `origin` to a clean HTTPS URL so the token is not persisted in the workspace remotes.
- When `AUTH_*` env vars are missing, sign-in UI is hidden and the advanced local/URL form still works.

**Consequence:** Demo works offline; with a GitHub OAuth App + `.env.local`, users browse and connect repos in one click. Callback URL: `{origin}/api/auth/callback/github`.

## 2026-08-04 — Continuous monitoring, requirement intake, PR/CI, clustering

**Context:** Spec §7–9, §15, §17, §20, §22, success #1/#8/#11 were still thin after the narrow assess→fix→evidence loop.

**Decision:**
- **Monitoring:** each assessment stores a content-hash snapshot; re-assessment diffs the tree, attributes via `git log` when available, and attaches change context to regression evidence (`monitoring_changes_detected`).
- **Requirement intake:** project `inScopeControlIds` plus import of custom (manual) controls under `fw-custom`; unscoped controls are not assessed.
- **PR/CI:** `npm run check` scans a tree and fails on violations; finding handoff can create a branch/commit and optionally `gh pr create` when git/`gh` are present.
- **Root cause:** cluster open findings by check + shared file/directory (`src/core/root-cause.ts`).
- **Temporary exceptions:** `temporary` + `expiresAt`; assessment clears expired ones with evidence, then re-derives status.

**Consequence:** Continuous compliance shows *what changed / who*; teams can bring their own checklist; CI and branch/PR paths exist without requiring GitHub OAuth in the MVP.

## 2026-08-04 — AI remediation, reports, exceptions, PR handoff

**Context:** Closing the remaining MVP gaps after local/git connect.

**Decision:**
- Deterministic explanations remain the happy-path baseline; AI explanation/remediation are optional, provenance-tagged, and never set statuses.
- Compliance report is Markdown (download) + printable HTML generated from requirements, findings, exceptions, and evidence.
- Requirement-level exceptions (`not_applicable` / `accepted_risk` / `compensating_control`) are sticky human decisions; assessments skip them until cleared.
- Manual verify and “mark implemented” cover remediations applied outside the platform.
- Developer handoff exposes a unified diff + PR title/body for copy/download without GitHub API.

## 2026-08-04 — Connect local path or git URL

**Context:** MVP success requires connecting real software, not only a canned demo.

**Decision:** Dashboard accepts a single field that is either an absolute/relative local directory (assessed and remediated in place) or a git remote URL (shallow-cloned into `.data/workspaces/`). Multiple projects are stored; `activeProjectId` selects the current target.

**Consequence:** Real apps can be assessed without GitHub OAuth. Local connects write remediations into the user's tree; git connects keep clones under `.data/`.

## 2026-08-04 — MVP implementation choices

**Context:** First working MVP of the full loop (assess → explain → remediate → verify → evidence) built and verified end-to-end in the browser.

**Decision:**
- **Persistence:** JSON file store (`.data/db.json`) behind `src/server/db.ts` instead of PostgreSQL — no external service required to run the demo; the module boundary keeps a later Postgres swap contained. Evidence stays append-only at the API level (`addEvidence`).
- **UI:** hand-rolled Tailwind components instead of shadcn/ui — the MVP needs only badges/cards/tables/forms; fewer moving parts. shadcn remains an option later.
- **Analysis:** custom TypeScript-AST checks (six RGAA/WCAG criteria) instead of axe-core — axe audits rendered DOM, but the product assesses *source code* and must map findings to exact file/line/element spans to power auto-fixes.
- **AI:** deterministic explanations generated at detection are the baseline; AI explanations are an optional enhancement gated by `AI_GATEWAY_API_KEY`, provenance-tagged, and never set statuses.
- **Verification semantics:** a remediation is verified by re-scanning the file and confirming the *specific violation instance* (matched by snippet, then line) is gone; warnings never block verification. (Seeded sample project later removed — see 2026-08-07 entry.)

**Consequence:** Early demos ran with `npm install && npm run dev` against a seeded sample; that sample path was retired in favor of explicit project connect.

## 2026-08-04 — Project scaffold, lint, and test tooling

**Context:** First concrete setup after the stack decision. Needed a working app skeleton plus quality gates.

**Decision:** Scaffolded with create-next-app 16.3.0 (Next.js 16, React 19, Tailwind 4, TypeScript strict, `src/` dir, Turbopack, npm). ESLint 9 flat config: `eslint-config-next` (core-web-vitals + typescript) with **strict `eslint-plugin-jsx-a11y` rules** layered on `*.tsx`/`*.jsx` — the product assesses others' accessibility, so our UI meets the same bar — and `@typescript-eslint/no-explicit-any` as an error. Testing: Vitest 4 (jsdom, native `resolve.tsconfigPaths`) + React Testing Library + jest-dom; tests colocated as `src/**/*.test.ts(x)`. Scripts: `lint`, `typecheck`, `test`, `test:watch`.

**Consequence:** `npm run lint && npm run typecheck && npm run test && npm run build` is the local quality gate from day one; CI can reuse it as-is.

## 2026-08-04 — Initial stack

**Context:** Greenfield build of the compliance engineering platform (see product spec). MVP targets accessibility (RGAA/WCAG) assessment of React/Next.js/TypeScript repos.

**Decision:** TypeScript strict everywhere; Next.js App Router + React for the app; Tailwind + shadcn/ui; PostgreSQL with a typed ORM; deterministic analysis via axe-core / eslint-plugin-jsx-a11y / custom AST checks; Vercel AI SDK for AI features. Exact ORM (Prisma vs Drizzle) to be decided when the data layer is built.

**Consequence:** One-language codebase; the analysis engine can share AST tooling with the apps it assesses.

## 2026-08-04 — Framework-agnostic core with adapters

**Context:** MVP is accessibility-only, but the spec requires supporting SOC 2, ISO 27001, EU CRA, EAA, and custom frameworks later without redesign.

**Decision:** The domain core (controls, requirements, assessments, findings, remediation, evidence, exceptions) is framework-agnostic. RGAA/WCAG logic lives in a framework adapter; deterministic checkers plug into an analysis engine interface.

**Consequence:** Adding a new compliance domain means writing an adapter + checks, not touching the core.

## 2026-08-04 — AI is never the source of truth

**Context:** Spec sections 11, 19, 23: AI accelerates work but statuses must rest on deterministic evidence or human decisions.

**Decision:** Only the core's status engine changes statuses, and only from deterministic check results or recorded human decisions. AI output enters the system as typed, provenance-tagged suggestions at `suggested` state.

**Consequence:** AI features can evolve freely (models, prompts) without ever compromising the integrity of compliance statuses or evidence.

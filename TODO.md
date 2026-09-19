# Global Project TODO

Audit of the actual code (not docs). Ordered by value; grouped so related root causes are one task.

## P2 — Medium

### [x] Fix concurrency data-integrity bugs in alerts, memberships, and org provisioning

**Why:** `markAlertReadAction` reads the alert outside the project lock and upserts the whole stale payload under it, discarding a concurrent assessment's refreshed alert (`actions/alerts.ts:35-42`, `repo/alerts.ts:44-85`). `upsertMembership` conflicts on `id` rather than the real unique keys `(org_id,user_id)` / `(org_id, lower(login))`, so duplicate invites throw `23505` instead of converging (`repo/orgs.ts:112-129`). Personal-org provisioning is a check-then-insert race with no lock (`repo/orgs.ts:241-278`).

**Where:** `src/server/actions/alerts.ts`, `packages/db/src/repo/alerts.ts`, `packages/db/src/repo/orgs.ts`, `src/server/workspace/workspace-write.ts`.

**Change:** Read the alert inside the lock (or add an `updatedAt` guard); set the upsert conflict target to the real unique constraints; take an advisory lock (or add a per-user owner uniqueness guard) around personal-org provisioning.

**Impact:** Medium — silent data loss and sign-in/write failures under concurrency.

### [x] Harden public/auth edge cases and the product's own accessibility

**Why:** `/login` is public and crashes with a 500 for crafted `?error=constructor` (prototype-chain lookup at `login/page.tsx:90`); the findings list tolerates orphan findings but the detail loader throws (`finding-detail-view.ts:104-107`); requirement titles are not headings and "Framework scope" is labelled four times in one subtree, which is notable for an accessibility product. Root 404 loses all product navigation.

**Where:** `src/app/(marketing)/login/page.tsx`, `src/server/workspace/finding-detail-view.ts`, `src/components/requirements/requirement-card.tsx`, `src/app/(app)/requirements/page.tsx`, `src/app/not-found.tsx`.

**Change:** Use `Object.hasOwn`/`Map` for error copy; handle the orphan-remediation case with `notFound()` consistently; make requirement titles headings; de-duplicate landmark/heading names; give the 404 an app/marketing shell.

**Impact:** Medium — unauthenticated crash + product credibility for an a11y tool.

### [x] Clean up install and dependency fragility

**Why:** `ssrf-guard` is rewritten by a custom postinstall because its published exports flap, and it declares Node >=24 while CI runs Node 22 (`postinstall-ssrf-guard.mjs`, `packages/analysis-core/package.json:14`); `@octokit/webhooks` is a production dependency used only for two type aliases; `tsx`/`typescript`/`dotenv` sit in `dependencies` though only scripts use them; `next-auth` is a beta pinned by range.

**Where:** `scripts/postinstall-ssrf-guard.mjs`, `package.json`, `packages/analysis-core/package.json`, `src/server/github/webhook.ts`.

**Change:** Pin/vendor the two `ssrf-guard` functions used and drop the postinstall patch; move type-only and script-only deps to `devDependencies`; pin `next-auth` exactly and track its releases.

**Impact:** Medium — security-critical install fragility and install-size bloat.

---

# ComplyLoop — prioritized todo

Snapshot against [`compliance-engineering-product-spec.md`](./compliance-engineering-product-spec.md) and the current codebase (Aug 2026).

**Status:** Spec §25 first-time loop (connect → assess → explain → remediate → verify → evidence → re-assess) works for a local/demo MVP. Remaining work is PR-native polish, safety for deploy, check depth, and productization.

---

## Done enough (do not re-open)

- [x] Domain core + statuses + remediation transitions
- [x] 10 AST accessibility checks + RGAA/WCAG adapter + fixtures
- [x] Connect sample / local / git URL / GitHub OAuth (+ connect/disconnect)
- [x] Assessment, findings, explanations, AI optional remediations
- [x] Approve → apply → verify (+ manual verify / mark implemented)
- [x] Exceptions (N/A, risk, compensating, temporary + expiry)
- [x] Evidence log + MD/HTML/JSON reports
- [x] Root-cause clustering + priority scoring (dashboard)
- [x] Monitoring snapshots, change attribution, webhook re-assess + alerts
- [x] Native GitHub PR create + handoff diff; `npm run check` + Actions template
- [x] Requirement presets + checklist import

---

## P0 — core loop gaps & safety

1. [x] **Human pass for manual controls** — let reviewers set a custom/checklist requirement to `passed` with a required note + evidence (today imports stay `unable_to_verify` or only exceptions).
2. [x] **GitHub Check Runs on PR webhooks** — after PR-triggered re-assess, post pass/fail + finding summary on the PR (spec §9).
3. [x] **Encrypt stored GitHub tokens** — stop plaintext `.data/github-tokens.json`; encrypt at rest with `AUTH_SECRET` (or equivalent) before any shared host.
4. [x] **Durable deploy story** — document or implement a target with persistent disk (or migrate store first); serverless ephemeral FS breaks `.data/`, clones, and webhooks.

---

## P1 — continuous DX, CI, depth, prioritization

5. [ ] **Customer-friendly CI install** — one-command / published CLI so assessed apps don’t need a monorepo path in the Actions template.
6. [ ] **Platform quality CI** — GitHub Action running `lint && typecheck && test && build` (current workflow only smoke-checks the violating fixture).
7. [ ] **Scoped re-scan on change** — when a snapshot diff exists, re-run checks on changed files first (full tree remains fallback).
8. [ ] **Fixes for newer checks** — safe automatable fixes where missing (`iframe-title` has one; heading-order / empty-heading / autoplay need clear guidance or fixes).
9. [ ] **Next high-value AST checks** — e.g. form error association, duplicate `id`, common `aria-*` misuse (credibility beyond the current 10).
10. [ ] **Prioritize Findings list** — use `prioritizeFindings` on `/findings` (dashboard already prioritizes; list still severity-only).
11. [ ] **Richer priority model** — add control-level compliance weight (and optional remediation difficulty) on top of severity × confidence × cluster.

---

## P2 — productization

12. [ ] **Postgres behind `src/server/db.ts`** — pick Drizzle or Prisma; keep append-only evidence; record choice in `docs/ai/decisions.md`.
13. [ ] **Orgs / tenants + RBAC** — replace soft `ownerUserId` filtering with real membership and project ACL.
14. [ ] **Auth production hardening** — require `AUTH_URL`, document least-privilege scopes, revoke/clear stored tokens on sign-out.
15. [ ] **Webhook idempotency** — dedupe by GitHub delivery id; optional admin re-deliver for failed events.
16. [ ] **Publishable check package** — e.g. `npx @complyloop/check` for customer repos.

---

## P3 — docs, polish, later

17. [ ] **Rewrite `docs/ai/architecture.md`** — still says sample-only / “GitHub later” and lists axe-core as analysis truth.
18. [ ] **Align README + old decisions** — “six checks” → ten; mark superseded Initial stack (shadcn / Postgres / axe) as historical.
19. [ ] **Richer alert UI** — surface who/what changed from monitoring evidence on regression alerts.
20. [ ] **Later (explicitly deferred)** — shadcn, axe/DOM layer, SOC 2 / ISO adapters, AI test generation, multi-app portfolio risk.

---

## Suggested next sprint

| Order | Item | Why |
|------:|------|-----|
| 1 | Findings list prioritization (P1.10) | Small, high UX value |
| 2 | Platform quality CI (P1.6) | Protects the gate |
| 3 | Customer-friendly CI install (P1.5) | Removes monorepo path friction |
| 4 | Fixes for newer checks (P1.8) | Depth without new rules |
| 5 | Scoped re-scan on change (P1.7) | Faster continuous loop |

When leaving the laptop demo: follow [`docs/deploy.md`](./docs/deploy.md), then **P2.12–13** (Postgres + tenants) before inviting real multi-user traffic.

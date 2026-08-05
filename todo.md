# ComplyLoop — prioritized todo

Snapshot against [`compliance-engineering-product-spec.md`](./compliance-engineering-product-spec.md) and the current codebase (Aug 2026).

**Status:** Spec §25 first-time loop works for a local/demo MVP. P0 and P1 are done; light P2 (auth/webhooks/check package) landed. Remaining productization is Postgres + tenants.

---

## Done enough (do not re-open)

- [x] Domain core + statuses + remediation transitions
- [x] 13 AST accessibility checks + RGAA/WCAG adapter + fixtures
- [x] Connect sample / local / git URL / GitHub OAuth (+ connect/disconnect)
- [x] Assessment, findings, explanations, AI optional remediations
- [x] Approve → apply → verify (+ manual verify / mark implemented)
- [x] Exceptions (N/A, risk, compensating, temporary + expiry)
- [x] Evidence log + MD/HTML/JSON reports
- [x] Root-cause clustering + priority scoring (dashboard + findings list)
- [x] Monitoring snapshots, change attribution, webhook re-assess + alerts
- [x] Native GitHub PR create + handoff diff; `npm run check` / `@complyloop/check` + Actions template
- [x] Requirement presets + checklist import
- [x] Human pass, Check Runs, encrypted tokens, durable deploy docs
- [x] Scoped re-scan, platform CI, auth hardening, webhook idempotency
- [x] Postgres via Drizzle behind `db.ts` (`DATABASE_URL`; JSON fallback)

---

## P0 — core loop gaps & safety

1. [x] **Human pass for manual controls**
2. [x] **GitHub Check Runs on PR webhooks**
3. [x] **Encrypt stored GitHub tokens**
4. [x] **Durable deploy story**

---

## P1 — continuous DX, CI, depth, prioritization

5. [x] **Customer-friendly CI install** — `@complyloop/check` / `npx complyloop-check` (workspace package; npm publish later).
6. [x] **Platform quality CI** — `.github/workflows/ci.yml` runs `lint && typecheck && test && build`.
7. [x] **Scoped re-scan on change** — changed JSX when snapshot diff exists; full tree fallback.
8. [x] **Fixes for newer checks** — autoplay `remove_attribute`; stronger heading-order / empty-heading guidance.
9. [x] **Next high-value AST checks** — duplicate-id, form-error-association, aria-hidden-focusable.
10. [x] **Prioritize Findings list** — `prioritizeFindings` on `/findings`.
11. [x] **Richer priority model** — control `complianceWeight`.

---

## P2 — productization

12. [x] **Postgres behind `src/server/db.ts`** — Drizzle + `DATABASE_URL`; JSON fallback; evidence insert-only (see `docs/ai/decisions.md`).
13. [ ] **Orgs / tenants + RBAC** — replace soft `ownerUserId` filtering with real membership and project ACL.
14. [x] **Auth production hardening** — require `AUTH_URL` when serving production; document scopes; clear tokens on sign-out.
15. [x] **Webhook idempotency** — dedupe by GitHub delivery id (admin re-deliver still optional).
16. [x] **Publishable check package** — local `@complyloop/check` bin (npm publish still later).

---

## P3 — docs, polish, later

17. [x] **Rewrite `docs/ai/architecture.md`**
18. [x] **Align README + old decisions**
19. [x] **Richer alert UI** — trigger / from→to / change context on regression alerts.
20. [ ] **Later (explicitly deferred)** — shadcn, axe/DOM layer, SOC 2 / ISO adapters, AI test generation, multi-app portfolio risk; npm publish of `@complyloop/check`.

---

## Suggested next sprint

| Order | Item | Why |
|------:|------|-----|
| 1 | Orgs / tenants + RBAC (P2.13) | Real multi-user ACL |
| 2 | Publish `@complyloop/check` to npm | Customer install without path |
| 3 | Move tokens/webhook deliveries into Postgres | Fewer disk dependencies |
| 4 | Admin webhook re-deliver | Ops recovery |
| 5 | Deferred polish (P3.20) | Only as needed |

When leaving the laptop demo: set `DATABASE_URL`, run `npm run db:migrate`, follow [`docs/deploy.md`](./docs/deploy.md), then **P2.13** before inviting real multi-user traffic.

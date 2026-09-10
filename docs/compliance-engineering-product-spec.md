# ComplyLoop — Product Specification

Help French web agencies turn RGAA/WCAG requirements into remediated, verified,
auditable code changes — continuously, across every client project.

**Related:** [README](../README.md) · [Architecture](./ai/architecture.md) ·
[Principles](../.cursor/rules/product-context.mdc) ·
[Domain](../.cursor/rules/domain-model.mdc)

## What this is

An accessibility **compliance engineering** platform: detect RGAA/WCAG gaps,
explain the technical cause, remediate, verify, keep evidence.

Not a GRC dashboard, a scanner that stops at findings, an audit-report
generator, an AI chatbot, or a replacement for RGAA auditors.

**Differentiator:** fix → verify → don't regress, per client, across the
agency portfolio.

## Who it's for

French digital agencies and ESNs (roughly 5–50 developers) delivering
RGAA-regulated sites to multiple clients.

Not the target: freelance auditors, single-site owners, SOC 2 / ISO teams.

## Core loop

```
Requirement → Assessment → Finding → Explanation → Remediation →
Verification → Evidence → Continuous monitoring
```

Every feature serves this loop, per client project. Statuses and principles
live in `.cursor/rules/` — do not restate them here.

## Scope

- React, Next.js, TypeScript
- RGAA / WCAG
- Orgs: roles `owner | admin | member | viewer`, invite by GitHub login,
  personal org on first sign-in, org switcher, `/org`

RGAA/WCAG catalog and presets live in `packages/analysis-core/src/adapters/`.
Requirement/control vocabulary is shared via `@complyloop/analysis-core/contract/`
— see [`domain-model.mdc`](../.cursor/rules/domain-model.mdc).

## Success

A user can connect a client repo, assess, understand a failure, remediate,
verify, export evidence, and catch regressions.

If that loop does not work for one client, the product is not delivering.

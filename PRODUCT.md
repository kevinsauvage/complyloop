# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

French digital agencies and ESNs (roughly 5–50 developers) delivering RGAA-regulated sites to multiple clients. Not the target: freelance auditors, single-site owners, SOC 2 / ISO teams.

Four roles use the product day to day, each with a different job:

- **Developers**: triage findings, understand the technical cause, apply or approve fixes (patch / draft PR), and verify them. They work inside their own editor and GitHub, and increasingly hand fixes to their own AI coding assistant.
- **Tech / project leads**: track compliance per client project, decide what gets fixed next, watch regressions after merges, and record exceptions.
- **Agency owners / account managers**: report compliance status and evidence to clients, and need exports and summaries they can forward.
- **Accessibility referents**: in-house RGAA specialists who do the manual reviews automation cannot settle (pertinence, heuristic, unable-to-verify criteria) and own exception decisions.

Org roles in the product are `owner | admin | member | viewer`. Viewers browse results but cannot run assessments or decide.

## Product Purpose

Turn RGAA/WCAG requirements into remediated, verified, auditable code changes, continuously, across every client project of an agency.

Success: a user can connect a client repo, assess, understand a failure, remediate, verify, export evidence, and catch regressions. If that loop does not work for one client, the product is not delivering.

## Positioning

A compliance **engineering** platform, not a GRC dashboard, a scanner that stops at findings, an audit-report generator, an AI chatbot, or a replacement for RGAA auditors.

Differentiator: fix → verify → don't regress, per client, across the agency portfolio. Statuses come only from deterministic checks or explicit human decisions, never from AI confidence, and every step leaves append-only evidence.

## Operating Context

- Core loop every surface serves: Requirement → Assessment → Finding → Explanation → Remediation → Verification → Evidence → Continuous monitoring.
- GitHub-native: GitHub App connect per client repo, assessments queued and run on a GitHub Actions worker, webhook re-assessment on merge to the tracked branch, draft PRs for approved fixes.
- Two analysis sources: source analysis (AST, jsx-a11y) always; rendered-page checks (Playwright/axe) only when a preview URL is configured. The UI must always say which one produced a result.
- Outputs that leave the app: evidence exports (JSON / Markdown / HTML audit and engineering reports), Copy for AI prompts, dashboard status summaries for Slack/standups/PRs, requirement links.
- Users move between many client projects inside one org, often in a triage session (keyboard j/k through a findings queue).

## Capabilities and Constraints

- Shipped scope: React, Next.js, TypeScript projects; RGAA / WCAG catalog and presets.
- Planned, not shipped (never describe as available): eco-design (RGESN), then performance, then passive security, on the same domain-neutral loop.
- AI is optional and never sets a requirement or finding status, never marks a remediation verified, and never auto-applies changes; AI output is labelled as AI-generated with provenance and confidence.
- Evidence is append-only; decisions and exceptions keep history.
- Terminology is fixed: Requirement, Assessment, Finding, Remediation, Verification, Evidence, Exception. Use Finding, not "issue" or "violation", in product chrome.
- Requirement statuses: passed, failed, needs review, not applicable, unable to verify. Automated and human-reviewed results are always distinguished.

## Brand Commitments

- Name: **ComplyLoop**. Tagline in product chrome: "Requirement → Fix → Verified → Evidence".
- Voice: developer language. Findings and remediation copy are written for engineers, not lawyers, and every finding answers what failed, why, where, impact, how to fix, and how we know it is fixed.
- Product copy is **English only**, even though the market is French; RGAA and WCAG criterion codes stay as references.

## Evidence on Hand

None yet: no customers, pilot agencies, testimonials, logos, or usage metrics. Marketing and product pages must not invent any; state capabilities, not social proof.

## Product Principles

1. **Evidence over claims.** Never show or imply a compliance status without the record behind it.
2. **Verification over AI confidence.** AI suggests; deterministic checks and named humans decide.
3. **Every finding is actionable.** A screen that shows a failure also shows where it is and the next step to close it.
4. **Continuous, not one-off.** Design for re-assessment, regressions, and the next merge, not a single audit snapshot.
5. **Serve the whole agency.** The same truth must work for the developer fixing it, the lead prioritising it, the referent reviewing it, and the account manager reporting it.

## Accessibility & Inclusion

The app is held to the bar it enforces on client projects: RGAA / WCAG 2.x AA (labels, keyboard access, semantic HTML, contrast, target size, reduced motion). jsx-a11y is strict and an axe e2e suite runs in CI.

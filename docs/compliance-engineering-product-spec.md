# Compliance Engineering Platform — Product Specification

> **One-liner:** Help French web agencies turn RGAA/WCAG accessibility
> requirements into remediated, verified, auditable code changes — across
> every client project, continuously, not as a one-time audit.

**Related docs:** [README](../README.md) · [Architecture](./ai/architecture.md) · [AGENTS](../AGENTS.md)

## Contents

1. [Product Vision](#1-product-vision)
2. [The Problem](#2-the-problem)
3. [Product Positioning](#3-product-positioning)
4. [Target Customers](#4-target-customers)
5. [Initial Product Focus](#5-initial-product-focus)
6. [Core User Journey](#6-core-user-journey)
7. [Core Product Loop](#7-core-product-loop)
8. [Continuous Compliance](#8-continuous-compliance)
9. [Developer Experience](#9-developer-experience)
10. [Findings](#10-findings)
11. [AI's Role](#11-ais-role)
12. [Human-in-the-Loop](#12-human-in-the-loop)
13. [Evidence](#13-evidence)
14. [Compliance Dashboard](#14-compliance-dashboard)
15. [Requirement Management](#15-requirement-management)
16. [Risk and Prioritization](#16-risk-and-prioritization)
17. [Root-Cause Analysis](#17-root-cause-analysis)
18. [Remediation](#18-remediation)
19. [Automatic Remediation](#19-automatic-remediation)
20. [Pull Requests](#20-pull-requests)
21. [Reports](#21-reports)
22. [Exceptions and Manual Decisions](#22-exceptions-and-manual-decisions)
23. [Product Principles](#23-product-principles)
24. [MVP Scope](#24-mvp-scope)
25. [What Success Looks Like](#25-what-success-looks-like)
26. [Long-Term Vision](#26-long-term-vision)
27. [Product Definition](#27-product-definition)
28. [Final Product Principle](#28-final-product-principle)

---

## 1. Product Vision

Build an engineering-first accessibility compliance platform for **French
web agencies and ESNs** that turns RGAA/WCAG requirements into actionable,
verifiable engineering work — across every client project the agency
delivers, not just the one being audited this quarter.

The product bridges:

**RGAA/WCAG requirement → Engineering finding → Remediation →
Verification → Evidence**

The goal is not to become another generic GRC dashboard, nor another RGAA
audit-report generator. The goal is to help agency engineering teams
continuously maintain accessibility compliance as client sites change,
across their whole client portfolio.

**Core promise:** From RGAA/WCAG requirement to verified code change and
audit evidence — client project by client project.

## 2. The Problem

An agency delivers RGAA-regulated websites to several clients at once. For
each one, compliance today typically looks like:

1.  An audit (internal or an external auditor's) identifies failures.
2.  Someone at the agency turns the audit grid into a ticket or spreadsheet
    entry — separately, per client.
3.  A developer investigates, often without the original audit context.
4.  The developer determines and implements a fix.
5.  Someone re-checks it, usually manually, sometimes not at all.
6.  Evidence for the client's déclaration d'accessibilité is assembled by
    hand, if at all.
7.  Nothing watches for regressions on the next release — the next audit is
    the next time anyone finds out something broke.

This repeats for every client, with no shared system tracking fix →
verify → regression across the agency's whole portfolio. It's slow,
fragmented, and the agency has no continuous, defensible answer to "is
client X still compliant right now?"

The product turns this into a continuous engineering workflow, per client
project, visible across the agency's whole portfolio.

## 3. Product Positioning

The product is **not**:

- another generic GRC dashboard
- another compliance checklist
- another RGAA/accessibility scanner that stops at a findings list
- another RGAA audit-report / déclaration generator with no code
  connection
- an AI compliance chatbot
- a generic AI coding agent
- a replacement for RGAA auditors
- a promise of automatic legal compliance

The product is:

> **An accessibility compliance engineering platform that helps agency
> engineering teams detect RGAA/WCAG gaps, understand their technical root
> cause, remediate them, verify the result, and maintain evidence over
> time — per client, across the agency's whole portfolio.**

Existing RGAA tools (scanners, audit-grid managers, report generators)
primarily tell an agency **what is wrong** for a given audit. This product
helps the agency's engineering team **fix what is wrong, prove it stayed
fixed, and do that consistently across every client site they maintain.**
That portfolio-wide fix→verify→regression loop — not the audit or the
findings list — is the differentiator against RGAA-specific competitors
already in this space.

## 4. Target Customers

### Primary

French digital agencies and ESNs, roughly 5–50 developers, delivering
RGAA-regulated websites (public sector, large accounts) to multiple
clients at once.

Especially agencies that:

- maintain several client sites under ongoing contracts, not just
  one-off delivery
- already face RGAA obligations from client audits or legal requirements
  and currently manage remediation ad hoc, per client
- need to produce credible evidence (déclaration d'accessibilité,
  remediation history) for clients or their clients' auditors

### Secondary (unvalidated — worth exploring, not yet a target)

In-house engineering teams at large organizations with recurring RGAA
obligations across multiple products or properties (the same shape of
problem as an agency managing multiple clients, just insourced). Not a
current focus — flagged here so it isn't lost if the agency ICP doesn't
pan out or an in-house team asks first.

### Explicitly not the primary target (for now)

- Individual freelance auditors or single-site owners — too small a
  workflow to need a portfolio-level engineering tool.
- General SaaS companies pursuing SOC 2 / ISO 27001 / other non-
  accessibility frameworks — see [Section 5](#5-initial-product-focus)
  for why this isn't the near-term wedge.

### Validation status

This ICP is a hypothesis, not yet confirmed. Before investing further in
build-out beyond the current MVP, validate by interviewing ~10 French
agencies about their actual RGAA workflow (audit → developer handoff → fix
→ verify → regression) without pitching the product first — the goal is
to find out whether the gap between "audit findings" and "verified,
non-regressing fix, provable across the whole client portfolio" is
genuinely painful enough to pay for.

Working pricing hypothesis: ~€149/month per agency (multi-project,
unlimited devs) — roughly 7–34 agency customers needed for €1k–5k MRR.
Treat this as a hypothesis to test in those interviews, not a committed
number.

## 5. Initial Product Focus

**RGAA/WCAG accessibility for French web agencies is the defined initial
market — not a stepping stone to a generic multi-framework compliance
platform.** The framework-agnostic domain core (requirements/controls
modeled generically, not hardcoded to WCAG strings) is an _engineering_
decision to avoid rework later, not a signal that the product is meant to
broaden its customer story any time soon.

Other compliance domains — SOC 2, ISO 27001, EU Cyber Resilience Act,
European Accessibility Act, internal policies, customer-specific
requirements — stay explicitly **out of scope** until the agency ICP is
validated and, ideally, an actual customer inside that base pulls the
product toward one of them (e.g. an agency that also needs SOC 2 for its
own SaaS product). Expanding frameworks before that happens dilutes the
positioning against the RGAA-specific competitors that are the real
competitive set right now.

## 6. Core User Journey

### Step 1 — Define requirements

An agency brings RGAA/WCAG requirements into the platform — from a prior
audit, the standard RGAA grid, or a client-specific checklist — for a
given client engagement.

The platform turns them into clear, actionable controls, scoped to that
client's project.

### Step 2 — Connect the software

The agency connects the client's repository (and, over time, its other
clients' repositories too — the platform is designed around one workspace
per client engagement, with status and evidence comparable across the
agency's whole portfolio, not just per project).

### Step 3 — Assess

The platform evaluates relevant requirements against the connected client
codebase.

Each requirement should have a clear status:

- Passed
- Failed
- Needs review
- Not applicable
- Unable to verify

Automatically verified results must be clearly distinguished from results
requiring human review.

### Step 4 — Explain the finding

Every failure should explain:

- what requirement failed
- why it failed
- where the problem was found
- the impact
- what should change
- confidence
- supporting evidence

The explanation should be useful to the agency's developers, not written
like a legal document.

### Step 5 — Remediate

Help the agency's engineering team resolve the issue through code,
configuration, or engineering practice, on the client's codebase.

AI should accelerate remediation while allowing users to review and
approve proposed changes before anything ships to a client's site.

### Step 6 — Verify

A generated fix is not automatically considered complete. The platform
should verify the result using appropriate automated checks whenever
possible.

The product should clearly communicate:

**Detected → Remediated → Verified**

### Step 7 — Generate evidence

Preserve useful evidence showing what was checked, what was found, what
changed, when it changed, how it was verified, and which
requirement/control it satisfies — in a form the agency can hand to that
client or the client's auditor.

## 7. Core Product Loop

```text
Requirement
    ↓
Assessment
    ↓
Finding
    ↓
Explanation
    ↓
Remediation
    ↓
Verification
    ↓
Evidence
    ↓
Continuous monitoring
    ↓
New change
    ↓
Re-assessment
```

This loop is the heart of the product, run per client project and rolled
up across the agency's portfolio.

## 8. Continuous Compliance

The product must not behave like a one-time audit tool.

Client sites change constantly. A requirement that passed yesterday can
fail after a pull request, configuration change, dependency update, or
content change made by the client's own CMS editors.

The product should continuously monitor relevant changes, per client
project, and identify regressions.

Example:

> **Compliance regression detected — Client X**

Show:

- what changed
- which requirement was affected
- why it now fails
- who introduced the change
- relevant code/configuration
- recommended remediation

Continuous regression detection, across every client the agency
maintains, is a major source of recurring value — it's the difference
between "compliant at the last audit" and "compliant right now."

## 9. Developer Experience

The product should feel like an engineering tool rather than a
traditional compliance application.

The ideal workflow is:

```text
Pull Request (on a client repo)
    ↓
Compliance checks
    ↓
Problem identified
    ↓
Developer sees why
    ↓
Suggested remediation
    ↓
Fix
    ↓
Verification
    ↓
Compliance passes
```

Compliance information should always be actionable, without the developer
needing to re-learn RGAA for every client.

## 10. Findings

Every finding should answer:

1.  **What requirement failed?**
2.  **Why did it fail?**
3.  **Where is the problem?**
4.  **How can it be fixed?**
5.  **How do we know it is fixed?**

Findings should connect RGAA/WCAG language to concrete engineering work,
without requiring the developer to be an accessibility expert.

## 11. AI's Role

AI is an important part of the product, but it must not be the source of
truth.

AI should help with:

- understanding requirements
- finding relevant code
- explaining findings
- identifying likely root causes
- proposing remediation
- generating code/configuration changes
- creating tests
- explaining compliance impact
- summarizing evidence
- helping users navigate requirements

The product should never rely solely on an AI response such as "this
looks compliant."

Prefer deterministic evidence and automated verification wherever
possible — this matters even more when the evidence may end up in a
client's official déclaration d'accessibilité.

## 12. Human-in-the-Loop

Users should be able to:

- accept a finding
- reject a finding
- mark something as not applicable
- request manual review
- review AI-generated remediation
- approve changes
- override an automated interpretation where appropriate
- add explanations or notes

Important decisions and exceptions should retain their history — an
agency needs to be able to show a client _why_ something was accepted as
an exception, not just that it was.

## 13. Evidence

Evidence is a first-class product concept.

For every requirement, users should understand:

```text
Requirement
    ↓
Current status
    ↓
Latest assessment
    ↓
Finding(s)
    ↓
Remediation
    ↓
Verification
    ↓
Evidence
```

Evidence should be easy to review and export — per client project — for
the agency's own developers, the client, the client's auditors, and, when
relevant, the agency's own account managers preparing a client review.

## 14. Compliance Dashboard

The dashboard should prioritize action over vanity scores, at two levels:
per client project, and rolled up across the agency's whole portfolio.

Users should quickly answer, for one client or across all of them:

- What is failing?
- What changed?
- What needs attention?
- What can be fixed automatically?
- What requires human review?
- What was recently fixed?
- What is verified?
- Where are regressions occurring?
- Which findings have the highest priority?
- Which clients are at risk of falling out of compliance soonest?

## 15. Requirement Management

Requirements should be organized around frameworks, controls,
requirements, tests, findings, remediation, and evidence — scoped per
client project, with the underlying RGAA/WCAG catalog shared across all of
them.

Users should be able to see, per client, which requirements are:

- passing
- failing
- under review
- not applicable
- untested

They should also understand which requirements are automatically
verifiable and which require human assessment.

## 16. Risk and Prioritization

Not every finding has the same importance.

Prioritization can consider:

- severity
- business/legal impact for that client
- number of occurrences
- technical risk
- confidence
- remediation difficulty
- how close a client is to an audit or declaration deadline

The objective is to prevent an agency's developers from receiving an
overwhelming list without knowing what to fix first — per client, and
across whichever client is most at risk this week.

## 17. Root-Cause Analysis

A major differentiator should be identifying common technical causes
behind multiple findings — especially valuable for an agency reusing the
same components, templates, or CMS across several client sites.

Instead of:

> 47 failures

the product should ideally explain:

> **47 failures across 3 client sites are caused by the same shared
> component/template.**

This lets an agency prioritize fixes that resolve many compliance issues
at once — potentially across multiple clients if they share a component
library. _(Not yet reflected in the current architecture — flagged as
roadmap, not current capability.)_

## 18. Remediation

Remediation is a workflow, not merely an AI answer.

A remediation can move through:

```text
Detected
   ↓
Investigating
   ↓
Suggested
   ↓
Approved
   ↓
Implemented
   ↓
Verified
```

The product must make it obvious whether a fix is merely suggested or
actually verified — an agency should never accidentally tell a client
something is fixed when it's only been proposed.

## 19. Automatic Remediation

Distinguish between:

### Safe automatic actions

Actions that can be confidently performed and verified.

### Suggested changes

AI-generated changes requiring developer review.

### Manual remediation

Changes requiring human judgment or that cannot safely be automated.

The goal is not to let AI change client code automatically. The goal is
to automate as much of the remediation lifecycle as can be done safely
and verifiably, with the agency's developer always in control of what
ships to a client.

## 20. Pull Requests

Remediation should fit naturally into the agency's existing development
workflow for that client.

A developer should be able to go from:

> Compliance failure

to:

> Proposed change

to:

> Pull request (on the client's repo)

to:

> Verification

without manually translating an RGAA finding into a development task.

The PR should explain:

- the requirement
- the failure
- the proposed change
- why the change solves the problem
- how it was verified

## 21. Reports

Support two primary audiences.

### Engineering view (agency developers)

- failing requirement
- affected code
- root cause
- remediation
- verification

### Compliance/client view

- requirement
- status
- evidence
- remediation history
- verification history
- exceptions
- timestamps

Designed to be handed directly to a client or their auditor, not just used
internally — this is what turns evidence into something the agency can
put in front of the people who are actually asking for it.

The same underlying work should serve both audiences.

## 22. Exceptions and Manual Decisions

Real compliance environments contain exceptions.

Users should be able to document, per client:

- accepted risks
- temporary exceptions
- compensating controls
- false positives
- requirements that do not apply
- manual verification decisions

Exceptions should retain context and history rather than simply hiding
failures — an agency needs to be able to defend an exception to a client
or auditor later.

## 23. Product Principles

### Engineering first

The product exists to help the agency's engineering team act.

### Evidence over claims

Never claim a client is compliant without appropriate evidence.

### Verification over AI confidence

AI suggestions are not proof.

### Continuous rather than one-time

Compliance must survive changes to a client's site, not just hold at
audit time.

### Action over dashboards

Every finding should lead toward a useful action.

### Explainability

Users should understand why something failed or passed, without needing
to be an RGAA expert.

### Human control

Agency developers remain responsible for what ships to a client.

### Framework-agnostic core, RGAA/WCAG-focused market

The domain model isn't tied to one framework, but the product's near-term
market and roadmap are — see [Section 5](#5-initial-product-focus).

### Developer-friendly language

Translate RGAA/WCAG requirements into practical engineering actions.

### Minimal friction

Connecting a client repository and getting the first useful result should
be extremely fast.

## 24. MVP Scope

The first version should be deliberately narrow.

The MVP must demonstrate the complete loop for one client project:

> **Requirement → Assessment → Finding → AI Explanation → Remediation →
> Verification → Evidence**

Scope:

- React
- Next.js
- TypeScript
- RGAA/WCAG requirements
- **Orgs as the workspace:** a user belongs to one or more orgs; projects
  belong to an org. Roles are `owner | admin | member | viewer`. Members
  are invited by GitHub login. A personal org is auto-provisioned on first
  sign-in so a solo user still has a home; extra orgs, the org switcher,
  and `/org` (members, export, deletion) are part of the product, not a
  later add-on.

The complete loop still has to work for **one client project**. Multi-org
is how tenancy is modeled, not a substitute for that loop.

Explicitly **out of this slice:** a second compliance framework adapter
(see [Section 5](#5-initial-product-focus)).

This is the defined product for the initial market, not a temporary
starting point for a broader platform. The domain concepts stay
framework-agnostic under the hood so other compliance domains _could_ be
added later, but that's not near-term scope.

## 25. What Success Looks Like

A successful first-time user at an agency should be able to:

1.  Bring in RGAA/WCAG requirements for a client project.
2.  Connect that client's repository.
3.  Run an assessment.
4.  See clear pass/fail/needs-review results.
5.  Open a failure and understand exactly what is wrong.
6.  See the affected technical area.
7.  Get a useful remediation proposal.
8.  Review or generate a change.
9.  Verify that the issue is resolved.
10. See the resulting evidence, in a form they could hand to that client.
11. Continue monitoring for regressions on that client's site.

If the product cannot deliver this complete loop for one client, it is
not yet delivering its core value — even though that client project
already lives in an org that can hold more projects and teammates. A
second compliance framework is still out of this slice.

## 26. Long-Term Vision

The product should evolve from:

> **"Help my agency prepare a client's RGAA audit."**

into:

> **"Help my agency continuously maintain accessibility compliance across
> every client site we build and run."**

And only after that's proven, potentially:

> **"Help regulated in-house teams do the same thing, insourced."**

Expansion into non-accessibility frameworks (SOC 2, ISO 27001, EU CRA)
stays a long-term option, not a near-term milestone — pursue it if and
when it's pulled by demand from inside the validated customer base, not
before.

## 27. Product Definition

**Category:** Accessibility Compliance Engineering / Continuous RGAA
Compliance

**Primary user:** Developers and technical leads at French web agencies
responsible for delivering and maintaining RGAA-compliant client sites.

**Secondary users:** Agency account managers/compliance leads preparing
client-facing evidence; eventually, in-house engineering teams at
regulated organizations (unvalidated).

**Core problem:** RGAA/WCAG requirements are disconnected from the
engineering work required to satisfy them, and that gap multiplies across
every client an agency maintains.

**Core solution:** Connect RGAA/WCAG requirements directly to client-
codebase assessment, remediation, verification, and evidence — per
client, visible across the agency's whole portfolio.

**Core differentiator:** Requirement → Code → Fix → Verification →
Evidence, per client, continuously — not another scanner or another audit-
report generator.

**Initial niche:** French web agencies/ESNs (5–50 developers) delivering
RGAA-regulated client sites on React/Next.js/TypeScript.

**Long-term opportunity (sequenced, not simultaneous):** in-house teams
with the same recurring-RGAA-obligation shape, then — only if pulled by
customer demand — adjacent compliance frameworks.

## 28. Final Product Principle

Do not build a system that merely tells an agency:

> **"Client X is not compliant."**

Build a system that tells the agency's engineering team:

> **"This requirement is failing on Client X's site, this is why, this is
> where the problem is, this is how you can fix it, here is the proposed
> change, and here is the evidence you can hand back to Client X proving
> the fix worked."**

That is the product.

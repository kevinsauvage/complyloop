# Compliance Engineering Platform — Product Specification

> **One-liner:** Connect compliance requirements to code assessment, remediation, verification, and evidence — continuously, not as a one-time audit.

**Related docs:** [README](./README.md) · [Architecture](./docs/ai/architecture.md) · [AGENTS](./AGENTS.md)

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

Build a developer-first compliance engineering platform that turns
compliance requirements into actionable, verifiable engineering work.

The product bridges:

**Compliance requirement → Engineering finding → Remediation →
Verification → Evidence**

The goal is not to become another generic GRC dashboard. The goal is to
help software teams continuously maintain compliance as their software
changes.

**Core promise:** From compliance requirement to verified code change
and audit evidence.

## 2. The Problem

Compliance teams can identify requirements and gaps, but engineering
teams are often left to determine how to fix them.

A typical workflow is:

1.  A requirement is identified.
2.  An audit finds a failure.
3.  Someone creates a ticket or spreadsheet entry.
4.  A developer investigates.
5.  The developer determines the fix.
6.  The fix is implemented.
7.  Someone verifies it.
8.  Evidence is collected manually.
9.  The audit status is updated.

This is slow, fragmented, repetitive, and difficult to maintain.

The product turns this into a continuous engineering workflow.

## 3. Product Positioning

The product is **not**:

-   another generic GRC dashboard
-   another compliance checklist
-   another accessibility scanner
-   another AI compliance chatbot
-   a generic AI coding agent
-   a replacement for auditors
-   a promise of automatic legal compliance

The product is:

> **A compliance engineering platform that helps software teams detect
> compliance gaps, understand their technical root cause, remediate
> them, verify the result, and maintain evidence over time.**

Traditional compliance platforms primarily tell teams **what is wrong**.
This product helps engineering teams **fix what is wrong and prove that
it was fixed**.

## 4. Target Customers

### Primary

Small and medium-sized software companies with engineering teams that
need to achieve or maintain compliance.

Especially:

-   SaaS companies
-   software companies selling to larger enterprises
-   startups preparing for their first major compliance audit
-   companies with 10--100 developers
-   companies with multiple repositories or applications

### Secondary

Agencies and consultants managing compliance or technical audits for
multiple clients.

The strongest initial customer is a software company where compliance
affects enterprise sales, customer requirements, security reviews,
audits, or regulatory obligations.

## 5. Initial Product Focus

Start with **software engineering compliance**, not every possible
compliance process.

The initial domain can leverage accessibility/RGAA/WCAG expertise
because it provides a concrete set of machine-checkable requirements.

However, the product must be broader than accessibility. It should be
conceptually based on **requirements and controls**, not a single
framework.

Potential future domains:

-   SOC 2
-   ISO 27001
-   EU Cyber Resilience Act
-   European Accessibility Act
-   RGAA / WCAG
-   internal company policies
-   customer-specific requirements
-   custom engineering requirements

## 6. Core User Journey

### Step 1 — Define requirements

A company brings requirements into the platform from an audit,
framework, customer requirement, regulation, internal policy, or custom
checklist.

The platform turns them into clear, actionable controls.

### Step 2 — Connect the software

The company connects repositories and engineering environments relevant
to those requirements.

### Step 3 --- Assess

The platform evaluates relevant requirements against connected software.

Each requirement should have a clear status:

-   Passed
-   Failed
-   Needs review
-   Not applicable
-   Unable to verify

Automatically verified results must be clearly distinguished from
results requiring human review.

### Step 4 --- Explain the finding

Every failure should explain:

-   what requirement failed
-   why it failed
-   where the problem was found
-   the impact
-   what should change
-   confidence
-   supporting evidence

The explanation should be useful to developers, not written like a legal
document.

### Step 5 --- Remediate

Help the engineering team resolve the issue through code, configuration,
infrastructure, repository settings, tests, or engineering practices.

AI should accelerate remediation while allowing users to review and
approve proposed changes.

### Step 6 --- Verify

A generated fix is not automatically considered complete. The platform
should verify the result using appropriate automated checks whenever
possible.

The product should clearly communicate:

**Detected → Remediated → Verified**

### Step 7 --- Generate evidence

Preserve useful evidence showing what was checked, what was found, what
changed, when it changed, how it was verified, and which
requirement/control it satisfies.

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

This loop is the heart of the product.

## 8. Continuous Compliance

The product must not behave like a one-time audit tool.

Software changes constantly. A requirement that passed yesterday can
fail after a pull request, configuration change, dependency update, or
infrastructure change.

The product should continuously monitor relevant changes and identify
regressions.

Example:

> **Compliance regression detected**

Show:

-   what changed
-   which requirement was affected
-   why it now fails
-   who introduced the change
-   relevant code/configuration
-   recommended remediation

Continuous regression detection is a major source of recurring value.

## 9. Developer Experience

The product should feel like an engineering tool rather than a
traditional compliance application.

The ideal workflow is:

```text
Pull Request
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

Compliance information should always be actionable.

## 10. Findings

Every finding should answer:

1.  **What requirement failed?**
2.  **Why did it fail?**
3.  **Where is the problem?**
4.  **How can it be fixed?**
5.  **How do we know it is fixed?**

Findings should connect compliance language to concrete engineering
work.

## 11. AI's Role

AI is an important part of the product, but it must not be the source of
truth.

AI should help with:

-   understanding requirements
-   finding relevant code
-   explaining findings
-   identifying likely root causes
-   proposing remediation
-   generating code/configuration changes
-   creating tests
-   explaining compliance impact
-   summarizing evidence
-   helping users navigate requirements

The product should never rely solely on an AI response such as "this
looks compliant."

Prefer deterministic evidence and automated verification wherever
possible.

## 12. Human-in-the-Loop

Users should be able to:

-   accept a finding
-   reject a finding
-   mark something as not applicable
-   request manual review
-   review AI-generated remediation
-   approve changes
-   override an automated interpretation where appropriate
-   add explanations or notes

Important decisions and exceptions should retain their history.

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

Evidence should be easy to review and export for auditors, customers,
security teams, compliance teams, and management.

## 14. Compliance Dashboard

The dashboard should prioritize action over vanity scores.

Users should quickly answer:

-   What is failing?
-   What changed?
-   What needs attention?
-   What can be fixed automatically?
-   What requires human review?
-   What was recently fixed?
-   What is verified?
-   Where are regressions occurring?
-   Which findings have the highest priority?

## 15. Requirement Management

Requirements should be organized around frameworks, controls,
requirements, tests, findings, remediation, and evidence.

Users should be able to see which requirements are:

-   passing
-   failing
-   under review
-   not applicable
-   untested

They should also understand which requirements are automatically
verifiable and which require human assessment.

## 16. Risk and Prioritization

Not every finding has the same importance.

Prioritization can consider:

-   severity
-   business impact
-   compliance importance
-   affected applications
-   number of occurrences
-   technical risk
-   exploitability where relevant
-   confidence
-   remediation difficulty
-   customer/audit importance

The objective is to prevent teams from receiving an overwhelming list
without knowing what to fix first.

## 17. Root-Cause Analysis

A major differentiator should be identifying common technical causes
behind multiple findings.

Instead of:

> 47 failures

the product should ideally explain:

> **47 failures are caused by the same shared component/configuration.**

This lets teams prioritize fixes that resolve many compliance issues at
once.

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
actually verified.

## 19. Automatic Remediation

Distinguish between:

### Safe automatic actions

Actions that can be confidently performed and verified.

### Suggested changes

AI-generated changes requiring developer review.

### Manual remediation

Changes requiring human judgment or that cannot safely be automated.

The goal is not to let AI change everything automatically. The goal is
to automate as much of the remediation lifecycle as can be done safely
and verifiably.

## 20. Pull Requests

Remediation should fit naturally into development workflows.

A developer should be able to go from:

> Compliance failure

to:

> Proposed change

to:

> Pull request

to:

> Verification

without manually translating a compliance finding into a development
task.

The PR should explain:

-   the requirement
-   the failure
-   the proposed change
-   why the change solves the problem
-   how it was verified

## 21. Reports

Support two primary audiences.

### Engineering view

-   failing requirement
-   affected code
-   root cause
-   remediation
-   verification

### Compliance/audit view

-   requirement
-   status
-   evidence
-   remediation history
-   verification history
-   exceptions
-   timestamps

The same underlying work should serve both audiences.

## 22. Exceptions and Manual Decisions

Real compliance environments contain exceptions.

Users should be able to document:

-   accepted risks
-   temporary exceptions
-   compensating controls
-   false positives
-   requirements that do not apply
-   manual verification decisions

Exceptions should retain context and history rather than simply hiding
failures.

## 23. Product Principles

### Engineering first

The product exists to help engineering teams act.

### Evidence over claims

Never claim compliance without appropriate evidence.

### Verification over AI confidence

AI suggestions are not proof.

### Continuous rather than one-time

Compliance must survive software changes.

### Action over dashboards

Every finding should lead toward a useful action.

### Explainability

Users should understand why something failed or passed.

### Human control

Users remain responsible for important compliance decisions.

### Framework-agnostic core

The product should not be fundamentally tied to one compliance
framework.

### Developer-friendly language

Translate compliance requirements into practical engineering actions.

### Minimal friction

Connecting a repository and getting the first useful result should be
extremely fast.

## 24. MVP Scope

The first version should be deliberately narrow.

The MVP must demonstrate the complete loop:

> **Requirement → Assessment → Finding → AI Explanation → Remediation →
> Verification → Evidence**

Recommended starting point:

### Accessibility compliance for modern web applications

Specifically:

-   React
-   Next.js
-   TypeScript
-   RGAA/WCAG-oriented requirements

This is a strong starting domain because it combines machine-checkable
accessibility requirements with source-code analysis and AI-assisted
remediation.

The product concepts should remain framework-agnostic so other
compliance domains can be added later.

## 25. What Success Looks Like

A successful first-time user should be able to:

1.  Bring in compliance requirements.
2.  Connect a software repository.
3.  Run an assessment.
4.  See clear pass/fail/needs-review results.
5.  Open a failure and understand exactly what is wrong.
6.  See the affected technical area.
7.  Get a useful remediation proposal.
8.  Review or generate a change.
9.  Verify that the issue is resolved.
10. See the resulting evidence.
11. Continue monitoring for regressions.

If the product cannot deliver this complete loop, it is not yet
delivering its core value.

## 26. Long-Term Vision

The product should evolve from:

> **"Help me prepare for an audit."**

into:

> **"Help my engineering organization continuously maintain
> compliance."**

Long term, every compliance requirement should be connectable to
software, infrastructure, engineering practices, automated tests,
evidence, and remediation workflows.

The ultimate loop is:

```text
Compliance requirement
        ↓
Machine-understandable control
        ↓
Continuous assessment
        ↓
Finding
        ↓
Root cause
        ↓
AI-assisted remediation
        ↓
Verified change
        ↓
Audit evidence
        ↓
Continuous monitoring
```

## 27. Product Definition

**Category:** Compliance Engineering / Continuous Compliance

**Primary user:** Software engineers and engineering teams responsible
for implementing compliance requirements.

**Secondary users:** Security, compliance, QA, technical auditors, and
engineering managers.

**Core problem:** Compliance requirements are disconnected from the
engineering work required to satisfy them.

**Core solution:** Connect compliance requirements directly to software
assessment, remediation, verification, and evidence.

**Core differentiator:** Requirement → Code → Fix → Verification →
Evidence

**Initial niche:** React/Next.js software teams, starting with
accessibility/RGAA/WCAG.

**Long-term opportunity:** Expand into security, SOC 2, ISO 27001, EU
CRA, EAA, and company-specific controls.

## 28. Final Product Principle

Do not build a system that merely tells companies:

> **"You are not compliant."**

Build a system that tells the engineering team:

> **"This requirement is failing, this is why, this is where the problem
> is, this is how you can fix it, here is the proposed change, and here
> is the evidence proving the fix worked."**

That is the product.

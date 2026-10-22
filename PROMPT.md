# ComplyLoop — Product Direction & Implementation Planning

You are working on the existing **ComplyLoop** codebase.

Your task is **documentation and architecture planning only**. Do NOT implement code or make product changes.

First, deeply inspect the existing project using the available project context/tools. **Do not trust existing comments or documentation blindly**. The code is the source of truth.

## Product direction

ComplyLoop should evolve from an accessibility-focused compliance tool into a broader **continuous compliance and quality engineering platform for digital products**.

The long-term product direction is:

```text
ComplyLoop
│
├── Accessibility
│   ├── RGAA
│   └── WCAG
│
├── Eco-design
│   └── RGESN
│
├── Performance
│   └── Web performance / Core Web Vitals / performance regressions
│
└── Security
    └── Web security / configuration / dependency checks
```

However, **do not treat these as four independent scanners**.

The core product should be a shared assessment and verification platform:

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
Monitoring
```

Different domains should plug into this common model.

For example:

### Accessibility

```text
RGAA / WCAG requirement
        ↓
automated/manual assessment
        ↓
finding
        ↓
remediation
        ↓
deterministic verification
        ↓
evidence
        ↓
monitoring
```

### Eco-design

```text
RGESN requirement
        ↓
automated measurement / manual assessment
        ↓
finding
        ↓
recommendation
        ↓
re-measurement / verification
        ↓
evidence
        ↓
monitoring
```

### Performance

```text
Performance requirement
        ↓
measurement
        ↓
regression/finding
        ↓
recommendation
        ↓
re-measurement
        ↓
evidence
        ↓
monitoring
```

The objective is to make the **platform architecture reusable across standards**, rather than creating separate architecture for each domain.

---

# Product priorities

The implementation should be phased.

## Phase 1 — Accessibility

Keep and strengthen the existing:

- RGAA
- WCAG
- assessment engine
- findings
- remediation
- deterministic verification
- evidence
- monitoring

Do not unnecessarily redesign working parts of the current system.

## Phase 2 — Eco-design

This is the next major expansion and should be the primary new domain.

Target:

- RGESN
- environmental measurements
- page-level environmental metrics
- historical measurements
- regression detection
- evidence
- monitoring
- potentially automated RGESN checks where technically reliable

Potential measurements include things such as:

- transferred data
- HTTP requests
- DOM complexity
- resource composition
- JavaScript/CSS/image/font weight
- third-party resources
- runtime/network measurements
- other defensible environmental-performance indicators

Investigate the role of EcoIndex carefully.

**Do not assume that EcoIndex itself should become the product or that its API/algorithm can simply be commercialized.**

The product should avoid becoming tightly coupled to a third-party scoring service.

The architecture should allow environmental measurement engines to evolve independently.

## Phase 3 — Performance

Potential scope:

- Core Web Vitals
- loading performance
- resource weight
- runtime performance
- performance regressions
- historical trends
- CI/CD checks

Reuse the same assessment/finding/evidence/monitoring infrastructure.

## Phase 4 — Security

Potential future scope:

- HTTP/security headers
- web configuration
- dependency/security checks
- common web security issues

This phase is intentionally later and should NOT drive current architecture decisions.

---

# Important product concept

The central product should become:

> **Continuous compliance and quality monitoring for digital products.**

The user should eventually be able to register a digital product and see a unified view such as:

```text
Digital Product

Accessibility      92%
Eco-design         78%
Performance        89%
Security           96%

Open findings      24
Regressions         3
```

Then drill into each domain and its applicable standards.

The platform should support:

- projects
- URLs/pages
- standards
- requirements
- assessments
- findings
- remediation
- verification
- evidence
- historical results
- trends
- regressions
- monitoring
- CI/CD integration

---

# Developer workflow

A major long-term differentiator should be continuous integration.

Example:

```text
Developer opens PR
        ↓
ComplyLoop analyzes preview
        ↓
Accessibility check
Eco-design check
Performance check
Security check
        ↓
Compare against baseline
        ↓
Detect regressions
        ↓
PR result
```

Example:

```text
⚠ Environmental regression

/product/shoes

Transferred data
420 KB → 890 KB (+112%)

HTTP requests
34 → 51 (+17%)

Environmental score
81 → 72 (-9)
```

The architecture should therefore eventually support:

- baseline comparison
- thresholds
- regression detection
- CI status
- PR checks
- deployment/preview analysis
- historical comparison

Do NOT implement these now unless they already exist. This task is planning/documentation.

---

# Your task

## 1. Audit the current project

Inspect the actual codebase and determine:

- current architecture
- domain boundaries
- assessment model
- requirement model
- finding model
- verification model
- evidence model
- monitoring model
- engines/checks
- database model
- worker architecture
- API boundaries
- UI structure
- existing documentation
- existing extensibility mechanisms
- existing assumptions that are accessibility-specific
- parts that would prevent adding RGESN cleanly

Identify architectural coupling that would make adding new domains difficult.

Do not propose a rewrite unless genuinely necessary.

---

## 2. Update the project documentation

Update the existing documentation structure rather than creating unnecessary duplicate documents.

The documentation should clearly explain the new product direction.

At minimum, document:

### Product vision

Explain the transition from:

> accessibility compliance tool

to:

> continuous compliance and quality engineering platform.

### Domain architecture

Document:

```text
Accessibility
Eco-design
Performance
Security
```

and explain which parts are shared platform infrastructure versus domain-specific logic.

### Standards

Document the intended relationship between:

- RGAA
- WCAG
- RGESN
- future performance standards/metrics
- future security standards/checks

Do not invent regulatory requirements.

Clearly distinguish:

- legal/regulatory requirements
- technical standards
- measurement frameworks
- optional metrics

### Assessment architecture

Explain how a requirement from any domain becomes:

```text
Requirement
→ Assessment
→ Finding
→ Remediation
→ Verification
→ Evidence
→ Monitoring
```

Identify which existing abstractions already support this and which need evolution.

### Eco-design architecture

Create a clear plan for introducing RGESN.

Cover:

- RGESN requirement representation
- automated vs manual criteria
- environmental measurements
- measurement engine abstraction
- page-level measurements
- historical measurements
- regression detection
- evidence
- monitoring
- scoring
- limitations and uncertainty

Explicitly separate:

1. measurements
2. requirements
3. findings
4. compliance status
5. scores

Do not collapse these concepts.

### Monitoring

Document the long-term monitoring model:

```text
Project
→ Pages
→ Measurements
→ Assessments
→ Findings
→ History
→ Trends
→ Regressions
```

Explain how a website changes over time and how ComplyLoop should detect and represent those changes.

### CI/CD

Document the future architecture for:

- GitHub integration
- PR checks
- preview deployments
- baseline comparison
- regression thresholds
- CI status

---

# 3. Create an implementation roadmap

Create a concise implementation plan ordered by dependency and value.

The roadmap should include:

```text
Phase 0 — Architecture preparation
Phase 1 — RGESN foundation
Phase 2 — Environmental measurement engine
Phase 3 — RGESN assessments
Phase 4 — Historical monitoring
Phase 5 — Regression detection
Phase 6 — Developer/CI integration
Phase 7 — Performance
Phase 8 — Security
```

Adjust these phases if the existing architecture suggests a better order.

For each phase provide:

- objective
- why it is needed
- affected areas
- architectural changes
- database changes
- API changes
- UI changes
- dependencies
- risks
- what should explicitly NOT be implemented yet

Keep it practical.

---

# 4. Identify architectural changes

Create a focused TODO list for the changes required to make the current architecture domain-agnostic.

Prioritize:

1. critical architectural blockers
2. important improvements
3. optional future improvements

Avoid speculative abstraction.

Follow KISS.

Do not introduce generic frameworks/interfaces merely because multiple domains might eventually exist.

Only abstract where there is a demonstrated shared concept.

---

# 5. Identify what should remain unchanged

This is important.

Explicitly list parts of the current architecture that are already good and should be preserved.

The goal is:

> evolve the architecture, not rewrite ComplyLoop.

---

# 6. Produce a product-level TODO

Create a short global TODO that another strong coding agent can execute later.

It should be concise and prioritized.

Format:

```text
P0 — Title
Why:
Scope:

P1 — Title
Why:
Scope:

P2 — Title
Why:
Scope:
```

Focus on implementation-ready architectural/product tasks rather than tiny coding tasks.

---

# 7. Challenge the idea

Do not blindly accept this product direction.

Add a section:

## Architecture/Product Risks

Evaluate:

- Is the shared compliance model actually appropriate for all four domains?
- Where does the model break down?
- Which concepts are accessibility-specific?
- Which concepts should remain domain-specific?
- Is RGESN sufficiently automatable?
- Which measurements are deterministic?
- Where is human assessment required?
- How should uncertain measurements be represented?
- Should EcoIndex be used directly?
- What are the licensing/commercialization risks?
- Should ComplyLoop calculate its own environmental score?
- How should scores differ from compliance status?
- What happens when a requirement cannot be automatically verified?
- How should evidence be stored?
- How should historical measurements be compared?
- What should be the source of truth?

Be critical.

---

# 8. Important constraints

Follow these rules throughout the analysis:

- **Code is the source of truth.**
- Do not blindly trust comments.
- Do not blindly trust existing documentation.
- Do not implement anything.
- Do not perform a large rewrite just to support future ideas.
- Prefer simple architecture.
- Avoid premature abstraction.
- Avoid dead code.
- Avoid speculative features.
- Keep domain-specific logic separate from shared infrastructure.
- Keep automated verification deterministic whenever possible.
- AI may explain findings or suggest remediation, but AI must NOT be the source of truth for compliance status.
- `verified` must mean something objectively verifiable.
- Distinguish `not applicable`, `not assessed`, `unable to verify`, `failed`, `passed`, etc. where appropriate.
- Measurements and compliance decisions must remain separate concepts.
- Scores must not be treated as compliance status.
- Do not claim that EU law currently mandates EcoIndex unless verified by authoritative sources.

---

# Deliverables

At the end of the task, the repository documentation should contain:

1. **Updated product vision**
2. **Updated architecture direction**
3. **Domain/standard model**
4. **RGESN implementation strategy**
5. **Environmental measurement strategy**
6. **Monitoring/history strategy**
7. **CI/CD strategy**
8. **Architecture gaps**
9. **Risks and open questions**
10. **Prioritized implementation roadmap**
11. **Short global TODO for implementation**

Keep the documentation concise and useful to future coding agents.

Do not generate a huge theoretical specification.

The goal is to leave the repository in a state where a strong coding agent can understand:

> **what ComplyLoop is becoming, why, what architecture needs to change, what should be built first, and what should not be built yet.**

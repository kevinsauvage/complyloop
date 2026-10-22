# ComplyLoop Design System

> Advisory source of truth for product UI/UX decisions. Enforceable UI
> patterns live in
> [`.cursor/rules/ui-conventions.mdc`](../../.cursor/rules/ui-conventions.mdc)
> and the [finding-page contract](./finding-flow.md).
>
> ComplyLoop is a developer-first compliance engineering platform for
> continuously identifying, understanding, fixing, verifying, and evidencing
> accessibility issues in web applications.
>
> **Design principle:** make compliance work feel like a normal part of the
> software development workflow, not like an external audit.
>
> **How to read this doc:** §1–4 (character, principles) first; §13–19 for
> the assessment → finding → verify → evidence flow; §44–46 as the
> pre-ship checklist. The rest is reference.

---

## 1. Product Character

ComplyLoop should feel:

- Technical
- Precise
- Calm
- Trustworthy
- Professional
- Developer-first
- Efficient
- Modern
- Focused
- Evidence-driven

It should **not** feel:

- Corporate
- Bureaucratic
- Governmental
- "AI startup"
- Security-paranoid
- Gamified
- Overly playful
- Marketing-heavy inside the application
- Visually noisy

### Core personality

Think:

**GitHub × Linear × Sentry × modern developer tooling**

Use these products as inspiration for qualities, not as templates to copy.

- GitHub → developer familiarity and information density
- Linear → hierarchy, restraint, keyboard-friendly workflows, polish
- Sentry → technical diagnostics and actionable issues
- Vercel → minimalism and strong typography
- Stripe → clarity and structured information

Do not reproduce their layouts, branding, colors, or components.

---

# 2. Primary UX Principle

## Compliance should feel actionable.

Every important piece of compliance information should answer:

1. What is wrong?
2. Why does it matter?
3. Where is it happening?
4. What should I do?
5. How can I verify the fix?
6. What evidence proves the result?

Avoid presenting compliance as a static report.

Prefer:

> Finding → Understand → Fix → Verify → Evidence

over:

> Finding → Read report

---

# 3. Design Priorities

When making UI decisions, prioritize in this order:

1. **Clarity**
2. **Task completion**
3. **Information hierarchy**
4. **Accessibility**
5. **Consistency**
6. **Performance**
7. **Visual polish**
8. **Decoration**

Never sacrifice clarity for visual novelty.

---

# 4. Design Philosophy

## KISS

Prefer the simplest UI that communicates the necessary information.

Do not introduce:

- unnecessary cards
- unnecessary modals
- unnecessary tabs
- unnecessary animations
- decorative containers
- redundant labels
- duplicate actions
- custom controls when an existing shadcn component works

If an element can be removed without reducing comprehension or functionality, remove it.

---

## Progressive disclosure

Do not show every piece of technical information immediately.

Primary information should be visible first.

Secondary technical details should be available when needed.

Example:

### Finding

Show immediately:

- rule
- severity
- affected location
- short explanation
- recommended action

Then progressively reveal:

- DOM/AST evidence
- engine
- confidence
- requirement mapping
- technical details
- raw evidence
- verification history

---

# 5. Visual Language

## Overall aesthetic

Use a restrained developer-tool aesthetic.

Characteristics:

- clean surfaces
- subtle borders
- strong typography
- compact controls
- generous but intentional whitespace
- limited color
- high information density where appropriate
- clear hierarchy
- minimal decoration

Avoid making every section look like a separate floating card.

### Prefer

```text
Page
 ├── Header
 ├── Summary
 ├── Content
 │    ├── Section
 │    ├── Table
 │    └── Detail
 └── Secondary information
```

over:

```text
Page
 ├── Card
 ├── Card
 ├── Card
 ├── Card
 └── Card
```

---

# 6. Color System

Use semantic colors rather than hard-coded colors.

The UI should work with the existing Tailwind/shadcn semantic token system.

Primary semantic tokens:

- background
- foreground
- card
- card-foreground
- popover
- popover-foreground
- primary
- primary-foreground
- secondary
- secondary-foreground
- muted
- muted-foreground
- accent
- accent-foreground
- destructive
- destructive-foreground
- border
- input
- ring

Add semantic product states where needed:

- success
- warning
- error
- info

## Color philosophy

Color communicates meaning.

Do not use color merely for decoration.

### Severity

Severity must never rely on color alone.

Use:

- label
- icon
- text
- color

together.

For example:

```text
[Critical] Missing accessible name
```

not merely:

```text
🔴
```

### Status

Use restrained status colors.

Avoid highly saturated backgrounds.

Prefer subtle backgrounds/borders with readable text.

---

# 7. Typography

Typography should prioritize readability and information hierarchy.

Use the existing project typography system rather than introducing fonts casually.

### Hierarchy

Use a small, consistent type scale.

Recommended conceptual hierarchy:

- Page title
- Section title
- Card/area title
- Body
- Secondary text
- Metadata
- Code/technical text

Do not create a new font size for every component.

### Headings

Headings should be concise.

Prefer:

> Accessibility findings

over:

> All the accessibility issues that were discovered during your latest repository assessment

### Body text

Keep paragraphs short.

Prefer scannable content.

---

# 8. Spacing

Use the existing Tailwind spacing scale.

Do not invent arbitrary values unless there is a clear reason.

Spacing should communicate hierarchy.

### General principle

Related elements:

```text
small gap
```

Different sections:

```text
larger gap
```

Different conceptual areas:

```text
largest gap
```

Avoid excessive whitespace that makes developer workflows slow to scan.

---

# 9. Borders, Radius & Shadows

## Borders

Prefer subtle borders to heavy shadows.

Borders should help establish structure without becoming visually dominant.

## Radius

Use a restrained radius system.

Avoid making every element excessively rounded.

Buttons, inputs, badges and cards should feel related.

Do not use pill-shaped containers unless the element is semantically a pill:

- status
- tag
- filter
- compact label

## Shadows

Use shadows sparingly.

Default surfaces should generally rely on:

```text
background + border
```

rather than:

```text
background + border + large shadow
```

Use elevation only when the UI genuinely needs separation.

---

# 10. Layout

ComplyLoop is a developer tool.

Optimize for scanning and working rather than visual presentation.

### Desktop

Use a structured application layout:

```text
┌───────────────────────────────────────────────┐
│ Global navigation / workspace                 │
├──────────────┬────────────────────────────────┤
│              │                                │
│ Sidebar      │ Main content                   │
│              │                                │
│              │                                │
└──────────────┴────────────────────────────────┘
```

The main content should have a comfortable maximum width.

Avoid unnecessarily narrow content areas for tables and technical information.

Avoid unnecessarily wide text blocks.

---

# 11. Navigation

Navigation should reflect the user's mental model.

Primary product concepts:

- Projects / repositories
- Assessments
- Findings
- Requirements
- Remediation
- Verification
- Evidence
- Monitoring
- Settings

Do not expose every internal domain concept in the primary navigation.

Navigation should prioritize user tasks rather than backend architecture.

---

# 12. Core Product Flow

The core experience is:

```text
Repository
    ↓
Assessment
    ↓
Requirements
    ↓
Findings
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

The UI should make this progression understandable.

The user should never feel lost between these states.

---

# 13. Assessment UX

An assessment is a process, not just a result.

Show:

- repository
- branch / commit
- assessment status
- progress
- engines used
- findings
- verification state
- timestamps

### Assessment states

Always design:

- not started
- queued
- running
- completed
- completed with findings
- failed
- cancelled
- unable to verify

Never design only the successful state.

### Running state

Show meaningful progress when available.

Do not fabricate percentages.

Prefer truthful stages:

```text
Cloning repository
✓

Analyzing source
●

Running accessibility checks
○

Processing findings
○

Generating evidence
○
```

---

# 14. Finding UX

A finding is one of the most important objects in the product.

It should be immediately understandable.

### Finding header

Show:

```text
[Severity] Rule title

Short explanation

Requirement / standard
Location
Status
```

### Primary actions

Actions should be obvious:

- View details
- Explain
- Fix / Remediate
- Verify

Do not bury the primary action inside an overflow menu.

---

# 15. Finding Details

Use progressive disclosure.

### Level 1 — Human understanding

Show:

- What is wrong?
- Why is it a problem?
- Who is affected?
- What should be changed?

### Level 2 — Developer implementation

Show:

- file
- line
- selector
- component
- relevant code
- suggested remediation

### Level 3 — Compliance evidence

Show:

- requirement
- criterion
- detection engine
- evidence
- verification
- history

The UI should not force non-technical users to read raw technical evidence before understanding the problem.

---

# 16. Code Display

Code is product content, not decoration.

Use:

- monospace typography
- clear line numbers when relevant
- syntax highlighting
- horizontal scrolling rather than wrapping when wrapping harms readability
- copy action
- file path
- contextual highlighting

Keep code blocks visually quiet.

Do not over-style them.

---

# 17. AI UX

AI is an assistant, not the authority.

The UI must clearly distinguish:

```text
Deterministic result
```

from:

```text
AI-generated explanation
```

and:

```text
AI-generated remediation suggestion
```

AI should never appear to determine compliance status.

### AI explanations

Label generated content clearly.

Example:

```text
AI explanation
Generated from this finding and its evidence.
```

Avoid implying that AI output is authoritative.

### AI remediation

Present suggestions as suggestions.

Prefer:

```text
Suggested fix
Review before applying
```

over:

```text
Correct fix
```

---

# 18. Verification UX

Verification is a core differentiator.

Make the distinction between:

```text
Detected
```

and:

```text
Verified
```

very clear.

A finding should not visually appear "fixed" merely because an AI generated a patch.

The trusted sequence is:

```text
Finding
   ↓
Remediation
   ↓
Deterministic re-check
   ↓
Verification
```

### Verification states

Support:

- not verified
- verification running
- verified
- still failing
- unable to verify

Never imply successful verification without deterministic evidence.

---

# 19. Evidence UX

Evidence should be easy to understand and audit.

Show:

- what was checked
- when
- against which commit/version
- which engine/check was used
- result
- supporting evidence

Prefer a timeline/history pattern where appropriate.

Example:

```text
Verified
17 Sep 2026 · commit abc123

✓ Requirement checked
✓ Finding re-analyzed
✓ Deterministic check passed
```

---

# 20. Tables

Tables are important for developer workflows.

Use tables when users need to:

- compare findings
- scan many results
- sort
- filter
- select items
- inspect status

Do not replace tables with cards merely because cards look more modern.

### Table principles

- concise columns
- meaningful alignment
- sortable when useful
- filterable when useful
- sticky headers when useful
- keyboard accessible
- clear row interaction
- avoid excessive borders

Do not display every available field by default.

---

# 21. Empty States

Empty states should explain:

1. What is empty?
2. Why is it empty?
3. What can the user do next?

Bad:

> No findings.

Better:

> No accessibility findings yet.

> Run an assessment to analyze this repository.

[Run assessment]

Empty states should always have a useful next action when one exists.

---

# 22. Loading States

Prefer skeletons for predictable page structures.

Use progress indicators for long-running processes.

Do not use spinners everywhere.

For assessments, communicate the current stage.

For small interactions, use immediate feedback.

---

# 23. Error States

Errors should be actionable.

Always explain:

- what happened
- whether user action is required
- what the user can do next

Avoid:

> Something went wrong.

Prefer:

> The repository could not be analyzed because the GitHub installation no longer has access to this repository.

[Reconnect GitHub]

---

# 24. Forms

Forms should be simple and predictable.

Principles:

- labels always visible
- clear required/optional status
- validation close to the relevant field
- useful error messages
- preserve user input when possible
- keyboard-friendly
- sensible defaults
- avoid unnecessary fields

Do not use placeholder text as the only label.

---

# 25. Notifications

Notifications should be:

- concise
- contextual
- actionable

Avoid flooding the user with toasts.

Use persistent inline feedback for important information.

Use toast notifications for transient confirmations.

---

# 26. Responsive Design

Design mobile intentionally.

Do not simply shrink the desktop UI.

For complex developer tables:

- preserve important columns
- allow horizontal scrolling when appropriate
- provide alternative compact views when necessary

For navigation:

- collapse secondary navigation
- preserve access to primary workflows

Touch targets must remain accessible.

---

# 27. Accessibility

Accessibility is part of the product itself.

All ComplyLoop UI must follow:

- WCAG 2.2
- semantic HTML
- keyboard navigation
- visible focus
- sufficient contrast
- accessible names
- correct labels
- appropriate ARIA only when needed
- reduced-motion support
- screen-reader compatibility

Never use color as the only indicator.

Never remove focus outlines without providing an equivalent visible focus state.

Prefer native HTML semantics over unnecessary ARIA.

---

# 28. Components

Use existing shadcn/ui components whenever possible.

Before creating a component:

1. Search the existing component library.
2. Check whether an existing component can be composed.
3. Extend an existing component if appropriate.
4. Create a new component only when it represents a genuinely reusable concept.

Avoid one-off component abstractions.

Avoid duplicate components that solve the same problem.

---

# 29. Design Tokens

Use semantic tokens.

Do not hard-code visual decisions throughout components.

Bad:

```tsx
className = "bg-blue-500 text-white rounded-xl shadow-lg";
```

Prefer semantic tokens:

```tsx
className = "bg-primary text-primary-foreground";
```

The exact implementation should follow the existing Tailwind/shadcn architecture.

Tokens should cover at minimum:

- colors
- typography
- spacing
- radius
- borders
- focus
- elevation
- motion

---

# 30. Motion

Motion should communicate state or hierarchy.

Use subtle transitions for:

- hover
- focus
- expanding content
- navigation
- dialogs
- status changes

Avoid:

- decorative animations
- constant movement
- excessive spring effects
- animations that slow down expert users

Respect:

```css
prefers-reduced-motion
```

---

# 31. Icons

Use a consistent icon library.

Do not mix unrelated icon styles.

Icons should reinforce meaning.

Never use an icon when it makes the interface less understandable.

Icon-only controls require accessible names and should use tooltips when appropriate.

---

# 32. Copywriting

ComplyLoop copy should be:

- concise
- technical but understandable
- direct
- neutral
- action-oriented

Avoid marketing language inside the product.

Prefer:

> Run assessment

over:

> Start your amazing compliance journey

Prefer:

> Verification failed

over:

> Oh no! Something went wrong 😢

Use precise terminology consistently.

---

# 33. Terminology

Use consistent product language.

Preferred concepts:

- Assessment
- Finding
- Requirement
- Remediation
- Verification
- Evidence
- Monitoring
- Repository
- Commit
- Rule
- Check

Do not randomly alternate between:

```text
issue
problem
violation
error
finding
```

when referring to the same domain object.

---

# 34. Visual Density

ComplyLoop is a professional developer tool.

Default to **medium/high information density**, while maintaining readability.

Users should be able to scan many findings without excessive scrolling.

Do not add whitespace merely to make screenshots look impressive.

Density should increase where users compare or investigate information.

Density should decrease where users make important decisions.

---

# 35. Dashboard Design

The dashboard should answer:

1. What needs my attention?
2. What changed?
3. What is currently running?
4. What is verified?
5. What remains unresolved?

Do not build a dashboard consisting primarily of decorative metrics.

Every metric should lead to a meaningful action or investigation.

Prefer:

```text
12 open findings
3 critical
4 awaiting verification
2 assessments running
```

with direct navigation to the underlying work.

---

# 36. SaaS Navigation & Workspace

The workspace should make the current context obvious.

Users should always understand:

```text
Organization
  → Project
    → Repository
      → Assessment
        → Finding
```

Do not hide important context.

Avoid deeply nested navigation when breadcrumbs can communicate hierarchy.

---

# 37. Onboarding

Onboarding should get the user to their first meaningful result quickly.

The ideal path is:

```text
Sign in
   ↓
Connect GitHub
   ↓
Select repository
   ↓
Run assessment
   ↓
See findings
   ↓
Understand first finding
```

Avoid long setup forms before the user sees product value.

---

# 38. GitHub Integration

GitHub should feel native to the developer workflow.

Use familiar concepts:

- repository
- branch
- commit
- pull request
- check
- installation

Do not unnecessarily abstract GitHub concepts.

Clearly distinguish GitHub state from ComplyLoop state.

---

# 39. Status Model

Status should always communicate actual system state.

Do not use optimistic language.

Examples:

```text
Queued
Running
Completed
Failed
Unable to verify
Verified
Needs attention
```

Avoid vague statuses such as:

```text
Processing...
Almost done
Looking good
Healthy
```

unless they have a precise defined meaning.

---

# 40. Security & Trust

Because ComplyLoop handles repositories and compliance data, trust is important.

The UI should communicate security through:

- predictable behavior
- clear permissions
- transparent GitHub access
- explicit destructive actions
- audit/history information
- clear system states

Do not use visual "hacker/security" clichés.

Avoid:

- terminal wallpaper aesthetics
- neon green
- excessive lock icons
- dark cyberpunk visuals
- unnecessary threat imagery

Trust should come from product clarity.

---

# 41. Performance

UI must remain fast.

Avoid:

- unnecessary client components
- excessive JavaScript
- large animation libraries for simple transitions
- unnecessary dependencies
- expensive visual effects
- rendering huge lists without virtualization where needed

Prefer server rendering and progressive loading where appropriate.

Do not add visual effects that materially hurt Core Web Vitals.

---

# 42. Anti-Patterns

Never introduce these without a strong product reason:

- Purple AI gradients
- Glassmorphism everywhere
- Giant rounded cards
- Excessive drop shadows
- Decorative blobs
- Excessive pills
- Gradient text
- Animated backgrounds
- Fake terminal aesthetics
- Emoji as primary UI
- Huge dashboard numbers with little meaning
- Every section inside a card
- Excessive badges
- Excessive modals
- Nested modals
- Tooltip-dependent interfaces
- Color-only statuses
- Placeholder-only labels
- Generic "AI magic" buttons
- Unexplained AI-generated content
- Invented progress percentages
- Decorative charts without actionable meaning

---

# 43. AI Agent Rules

When an AI agent changes the UI:

## Before coding

1. Inspect the existing design system.
2. Inspect existing components.
3. Inspect related screens.
4. Understand the user flow.
5. Identify reusable patterns.
6. Check this DESIGN.md.
7. Prefer existing components over creating new ones.

## During coding

- Follow existing tokens.
- Reuse components.
- Avoid duplication.
- Keep the implementation simple.
- Do not introduce new dependencies for trivial UI.
- Do not create arbitrary colors or spacing values.
- Do not redesign unrelated areas.
- Preserve accessibility.
- Preserve responsive behavior.

## After coding

The agent must review the rendered UI.

Check:

- desktop
- mobile
- keyboard navigation
- loading state
- empty state
- error state
- success state
- long content
- accessibility
- visual hierarchy
- consistency with neighboring screens

Then fix identified issues.

---

# 44. UI Review Checklist

Before considering UI work complete, ask:

### Visual

- Is hierarchy immediately clear?
- Is the page visually calm?
- Is spacing consistent?
- Are typography levels consistent?
- Are colors semantic?
- Are borders/radius/shadows restrained?
- Does the UI look like the same product as surrounding pages?

### UX

- Is the primary action obvious?
- Can the user understand what happened?
- Are empty/loading/error states handled?
- Are destructive actions clear?
- Is important information visible without unnecessary interaction?
- Is progressive disclosure used appropriately?

### Accessibility

- Can everything be operated with a keyboard?
- Is focus visible?
- Are controls correctly labelled?
- Is color insufficient on its own?
- Is contrast sufficient?
- Are dynamic updates accessible?
- Does reduced motion work?

### Responsive

- Does the layout work on mobile?
- Are tables usable?
- Are navigation controls accessible?
- Does content overflow correctly?
- Are touch targets appropriate?

### Implementation

- Are existing components reused?
- Is there duplicated UI logic?
- Were unnecessary abstractions avoided?
- Were unnecessary dependencies avoided?
- Are semantic tokens used?
- Is the implementation consistent with the architecture?

---

# 45. Definition of Done

A UI change is complete only when:

```text
✓ Design intent is clear
✓ Existing design system was reused
✓ UX states are covered
✓ Accessibility is covered
✓ Responsive behavior is covered
✓ Rendered UI was inspected
✓ Visual inconsistencies were fixed
✓ No unnecessary components were created
✓ No unnecessary dependencies were added
✓ No duplicated design patterns were introduced
✓ No unrelated UI was changed
```

---

# 46. Golden Rule

> **Do not make ComplyLoop look impressive. Make it feel exceptionally clear, trustworthy, fast, and effortless to use.**

The best UI is the one where a developer immediately understands:

**what happened → why → what to do → whether it worked → what proves it.**

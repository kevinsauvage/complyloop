---
name: ux-component
description: Generate accessible UI components following WCAG/RGAA standards and project design system
user-invocable: true
---

# UX Component Generator Skill

This skill generates accessible UI components that follow WCAG 2.1/2.2 and RGAA standards, integrates with the project's design system (shadcn/ui, Tailwind), and ensures compliance with accessibility requirements.

## Usage

Generate accessible UI components:

```bash
# Generate a button component
/ux-component --type button --name PrimaryButton --variant primary

# Generate a form input component
/ux-component --type input --name EmailInput --label "Email Address" --required

# Generate a modal dialog
/ux-component --type modal --name ConfirmationDialog --title "Confirm Action" --actions "Confirm,Cancel"

# Generate a data table with accessibility features
/ux-component --type table --name ComplianceDataTable --columns "Standard,Status,Last Updated,Actions" --sortable --filterable

# Generate a navigation component
/ux-component --type nav --name ComplianceSidebar --items "Dashboard,Assessments,Evidence,Reports,Settings"
```

## Implementation Guidelines

Generated components will include:
1. **WCAG 2.1/2.2 Compliance**:
   - Proper ARIA labels and roles
   - Keyboard navigation support
   - Sufficient color contrast (minimum 4.5:1)
   - Focus visible indicators
   - Error identification and suggestions
   - Responsive design for different viewport sizes

2. **RGAA Specific Requirements**:
   - French language accessibility compliance
   - Proper document structure and semantics
   - Accessible rich internet applications
   - Multimedia accessibility

3. **Design System Integration**:
   - Uses shadcn/ui primitives where applicable
   - Follows Tailwind CSS utility classes
   - Consistent with existing component patterns
   - Proper theming and dark mode support

4. **Code Quality**:
   - TypeScript with proper typings
   - React best practices
   - Accessibility testing considerations
   - Documentation and JSDoc comments

## Example Output

When generating a button component:
```
✅ Generated accessible Button component: src/components/ui/PrimaryButton.tsx

Features included:
- WCAG 2.1 AA compliant color contrast
- Proper ARIA labeling
- Keyboard accessible (Enter/Space to activate)
- Focus visible indicator
- Loading state support
- Size variants (default, sm, lg)
- Loading and disabled states
- Tailwind CSS styling with design tokens
- TypeScript interface for props
```

## Configuration

The skill references:
- `.claude/agents/accessibility-reviewer` for validation
- Project's Tailwind configuration (`tailwind.config.ts`)
- shadcn/ui component patterns
- WCAG 2.1/2.2 guidelines
- RGAA 4.1 requirements

Generated components are automatically reviewed by the accessibility-reviewer subagent for compliance.

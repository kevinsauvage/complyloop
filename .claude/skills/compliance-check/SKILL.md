---
name: compliance-check
description: Run accessibility and compliance checks against WCAG/RGAA standards
user-invocable: true
---

# Compliance Check Skill

This skill runs accessibility and compliance checks against WCAG/RGAA standards for the Compliance Engineering Platform.

## Usage

Run compliance checks on components or pages:

```bash
# Check a specific component
/compliance-check --component src/components/Button.tsx

# Check a page
/compliance-check --page src/app/dashboard/page.tsx

# Run full compliance suite
/compliance-check --full
```

## Implementation

This skill would typically:
1. Analyze the target component/page for accessibility issues
2. Check against WCAG 2.1/2.2 and RGAA standards
3. Generate a report with violations and recommendations
4. Optionally suggest fixes

## Example Output

```
✅ Compliance Check Results
========================
Component: src/components/Button.tsx
Status: PASS
Issues found: 0

---
Component: src/components/FormInput.tsx
Status: FAIL
Issues found: 2
- Missing aria-label on input (WCAG 1.1.1)
- Insufficient color contrast (WCAG 1.4.3)
```

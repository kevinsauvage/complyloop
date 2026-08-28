# Analysis: RGAA and WCAG Compliance Implementation

## Overview

The Compliance Engineering Platform (ComplyLoop) implements accessibility compliance with a focus on both RGAA (Référentiel Général d'Amélioration de l'Accessibilité) for the European market and WCAG (Web Content Accessibility Guidelines) for international compliance. This analysis examines how well the current implementation serves users from the EU needing RGAA compliance and users from other countries needing WCAG compliance.

## Current Implementation

### Framework Definition

The platform defines a single combined framework:
```typescript
export const rgaaFramework: Framework = {
  id: "fw-rgaa-wcag",
  name: "RGAA 4 / WCAG 2.1 (accessibility subset)",
  version: "2026.3",
};
```

### Control Structure

Each control in the system includes both WCAG and RGAA references:
- `code`: Primary reference (WCAG standard, e.g., "WCAG 1.1.1")
- `secondaryCode`: Secondary reference (RGAA standard, e.g., "RGAA 1.1")

Example from `src/adapters/rgaa/controls.ts`:
```typescript
{
  id: "ctl-img-alt",
  frameworkId: rgaaFramework.id,
  code: "WCAG 1.1.1",
  secondaryCode: "RGAA 1.1",
  title: "Images have a text alternative",
  // ...
}
```

### Framework Registration

Currently, only one framework adapter is registered:
- RGAA/WCAG combined framework
- The registry is designed to accept additional frameworks (SOC 2, ISO 27001, custom)

## Analysis: EU Users (RGAA Compliance)

### Strengths

1. **Explicit RGAA References**: Every control includes an RGAA reference (`secondaryCode`), making it clear which RGAA rule is being assessed.

2. **Framework Naming**: The framework name explicitly mentions "RGAA 4", signaling EU compliance support.

3. **Comprehensive Coverage**: The "Full RGAA/WCAG subset" preset includes all machine-checkable controls from the MVP adapter.

4. **Detailed Guidance**: The guidance.ts file provides specific remediation instructions that would be applicable for RGAA compliance.

### Limitations

1. **No RGAA-Only Assessment**: Users cannot assess against RGAA exclusively; WCAG rules are always included simultaneously.

2. **Potential Confusion**: Users needing to demonstrate pure RGAA compliance for EU regulations might see WCAG references and question whether they're being assessed against the correct standard.

3. **Lack of RGAA-Specific Presets**: While there are topical presets (images/media, forms/names, etc.), none are specifically labeled as "RGAA Essential" or tailored to common RGAA assessment scopes.

## Analysis: Non-EU Users (WCAG Compliance)

### Strengths

1. **Primary WCAG References**: The `code` field uses WCAG standards as the primary reference, making WCAG compliance the default focus.

2. **International Recognition**: WCAG is the globally recognized standard for web accessibility, making this approach suitable for international users.

3. **Framework Clarity**: The framework name includes "WCAG 2.1", clearly signaling international accessibility support.

### Limitations

1. **No WCAG-Only Assessment**: Similar to RGAA users, international users cannot assess against WCAG exclusively; RGAA rules are always included.

2. **Secondary RGAA References**: Users focused purely on WCAG might find the RGAA secondary references confusing or unnecessary.

## Technical Implementation Review

### How Requirements Are Created

Looking at the codebase, requirements are created by connecting controls to projects:
- Each requirement links to a control via `controlId`
- The control contains both WCAG and RGAA references
- When assessed, the requirement inherits both references

### Assessment Process

The assessment engine (in `src/analysis/`) appears to:
1. Check each control/in-scope requirement
2. Run the corresponding check (identified by `checkId`)
3. Generate findings that would include both WCAG and RGAA references from the control

### Evidence Generation

Evidence records would include:
- Which requirement/control was checked
- The status (passed/failed)
- Likely both WCAG and RGAA references given the control structure

## Recommendations

### Short-Term Improvements

1. **Add Framework Selection to Project Settings**
   - Allow projects to specify which frameworks they want to be assessed against
   - Modify the assessment engine to filter controls by selected frameworks
   - Update the Project interface to include `frameworkIds?: string[]`

2. **Enhance UI to Show Selected Framework References**
   - When viewing requirements/findings, prominently display references from the selected framework(s)
   - Optionally show secondary references from other frameworks

3. **Create Framework-Specific Presets**
   - Add presets like "RGAA Essential" and "WCAG Core" that select controls appropriate for each standard
   - This would help users quickly configure common assessment scopes

### Medium-Term Improvements

1. **Separate Framework Adapters**
   - Consider splitting into distinct RGAA and WCAG adapters
   - This would allow cleaner separation while still permitting combined assessment
   - Maintain backward compatibility by keeping the combined option

2. **Framework Mapping Documentation**
   - Add documentation explaining how RGAA and WCAG controls map to each other
   - Help users understand equivalences and differences between the standards

3. **Assessment Mode Toggle**
   - Add UI controls to switch between:
     - RGAA-only mode
     - WCAG-only mode  
     - Combined mode (current behavior)
   - This would accommodate different user needs without requiring project reconfiguration

### Long-Term Improvements

1. **Extensible Framework Architecture**
   - Make it easier to add new frameworks (beyond SOC 2/ISO mentioned in comments)
   - Ensure the core domain remains truly framework-agnostic as stated in the vision

2. **Regional Compliance Packs**
   - Offer pre-built configurations for specific regions:
     - EU Pack (RGAA + EN 301 549)
     - US Pack (WCAG + Section 508)
     - Canada Pack (WCAG + AODA)
     - International Pack (WCAG only)

## Conclusion

The current implementation demonstrates good intentions by including both RGAA and WCAG references in each control, reflecting the fact that RGAA 4 is largely based on WCAG 2.1 with some additional requirements and clarifications.

However, the approach of always assessing against both frameworks simultaneously may not serve all users optimally:
- EU organizations needing to demonstrate strict RGAA compliance for public sector procurements
- International organizations needing to show WCAG compliance for global accessibility statements
- Organizations in regions with specific accessibility laws that reference WCAG but have additional local requirements

The platform's strength lies in its extensible architecture (designed to add SOC 2, ISO, custom frameworks), which provides a solid foundation for improving the framework selection mechanism. Implementing the recommended changes would make the platform more flexible and better able to serve diverse compliance needs while maintaining its core value proposition of turning compliance requirements into actionable engineering work.

For the immediate MVP release, the combined approach is reasonable and provides value to both user groups. However, as the platform evolves beyond the MVP, implementing framework selection capabilities would significantly enhance its utility for organizations with specific compliance requirements.
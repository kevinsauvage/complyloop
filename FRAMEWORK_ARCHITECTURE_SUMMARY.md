# Extensible Framework Architecture Implementation Summary

## Overview

This implementation refactors the Compliance Engineering Platform to support proper framework selection, separating RGAA and WCAG into distinct adapters while maintaining backward compatibility and enabling future framework additions.

## Changes Made

### 1. Separated Framework Adapters
- Created separate directories: `src/adapters/rgaa/` and `src/adapters/wcag/`
- Each adapter contains its own:
  - Framework definition (`framework.ts` or within `controls.ts`)
  - Controls array (`controls.ts`)
  - Guidance mappings (`guidance.ts`)
  - Presets (`presets.ts`)

### 2. Updated Framework Definitions
**RGAA Framework** (`src/adapters/rgaa/controls.ts`):
```typescript
export const rgaaFramework: Framework = {
  id: "fw-rgaa-4",
  name: "RGAA 4 (French accessibility standard)",
  version: "2026.3",
};
```

**WCAG Framework** (`src/adapters/wcag/controls.ts`):
```typescript
export const wcagFramework: Framework = {
  id: "fw-wcag-2-1",
  name: "WCAG 2.1 (accessibility standard)",
  version: "2026.3",
};
```

Note: Control IDs remain the same, but primary/secondary codes are swapped to reflect each framework's priority.

### 3. Enhanced Project Model
Added `frameworkIds` field to `Project` interface (`src/core/project-types.ts`):
```typescript
export interface Project {
  // ... existing fields
  /**
   * Framework IDs in scope for this project. `undefined` means every framework
   * is in scope (backward compatibility).
   */
  frameworkIds?: string[];
  // ... existing fields
}
```

### 4. Updated Assessment Logic
Modified `controlsInScope` function (`src/server/assessment-status.ts`) to respect both:
- `frameworkIds`: Filters controls by framework when set
- `inScopeControlIds`: Filters controls by ID when set
- Both work together for precise scoping

### 5. Updated Requirements Intake
Modified `applyFrameworkPreset` function (`src/server/requirements-intake.ts`) to:
- Update `frameworkIds` when applying presets
- Maintain backward compatibility with existing `inScopeControlIds` logic

### 6. Database Migration
Added migration script (`drizzle/0007_framework_ids.sql`):
```sql
ALTER TABLE projects
ADD COLUMN framework_ids jsonb;
```

Updated schema definition (`src/server/db-store/schema.ts`) to include the new field in the Project type.

### 7. Seeding Logic
Enhanced `ensureSeeded` function (`src/server/seed.ts`) to:
- Initialize `frameworkIds` as `undefined` for existing projects (backward compatibility)
- Ensure new projects get proper default values

### 8. Updated Tests
Modified test file (`src/adapters/registry.test.ts`) to:
- Test both RGAA and WCAG framework registration
- Verify control counts are doubled (27 controls × 2 frameworks = 54+)
- Test preset functionality for both frameworks

## Backward Compatibility

This implementation maintains full backward compatibility:
- Existing projects without `frameworkIds` set will behave as before (all frameworks in scope)
- Existing `inScopeControlIds` logic continues to work unchanged
- All existing API endpoints and data structures remain functional
- Custom framework functionality (`fw-custom`) is preserved

## New Capabilities

### Framework-Specific Assessment
Users can now:
1. Assess against RGAA only by setting `frameworkIds: ["fw-rgaa-4"]`
2. Assess against WCAG only by setting `frameworkIds: ["fw-wcag-2-1"]`
3. Assess against both by setting `frameworkIds: ["fw-rgaa-4", "fw-wcag-2-1"]` or leaving `frameworkIds` undefined
4. Assess against custom frameworks by including `"fw-custom"` in `frameworkIds`

### Enhanced Presets
Each framework now has its own presets:
- **RGAA**: `preset-rgaa-full`, `preset-rgaa-aa`, `preset-rgaa-aaa`, etc.
- **WCAG**: `preset-wcag-full`, `preset-wcag-aa`, `preset-wcag-aaa`, etc.

### Future Extensibility
Adding new frameworks is now straightforward:
1. Create new adapter directory (e.g., `src/adapters/soc2/`)
2. Implement framework definition, controls, guidance, and presets
3. Export and add to `frameworkAdapters` array in `src/adapters/registry.ts`
4. Run migrations if needed (for new framework-specific data)

## Impact on Users

### For EU Organizations (RGAA Focus)
- Can now select RGAA-only assessment to avoid confusion with WCAG references
- RGAA references appear as primary codes in findings and requirements
- Access to RGAA-specific presets for common assessment scopes

### For International Organizations (WCAG Focus)
- Can now select WCAG-only assessment for pure international compliance
- WCAG references appear as primary codes in findings and requirements
- Access to WCAG-specific presets aligned with WCAG 2.1 levels (A, AA, AAA)

### For Organizations Needing Both
- Can continue using combined assessment (default behavior)
- Benefit from clearer framework attribution in findings
- Ability to scope assessments to specific frameworks when needed

## Technical Details

### Control Duplication
Each control exists twice in the system (once per framework) but:
- Shares the same `checkId` linking to the same automated check
- Has identical compliance weights
- Maintains separate framework-specific primary/secondary codes
- This approach preserves assessment logic while enabling framework-specific presentation

### Assessment Process
During assessment:
1. System determines which frameworks are in scope via `frameworkIds`
2. Filters controls to only those belonging to in-scope frameworks
3. Further filters by `inScopeControlIds` if set
4. Runs checks against the resulting control set
5. Findings and requirements retain framework context via `control.frameworkId`

### Data Storage
- Framework and control data stored as JSONB in database tables
- `framework_ids` column added to `projects` table as JSONB (null = all frameworks)
- No changes needed to findings, requirements, or other tables as they reference controls by ID

## Migration Path

Existing installations will:
1. Automatically get `framework_ids` column set to NULL (meaning all frameworks) via migration
2. Continue working exactly as before
3. Gain ability to scope to specific frameworks through UI or API
4. See enhanced framework-specific presets in the interface

## Future Enhancements

Potential future improvements based on this foundation:
1. UI framework selector in project settings
2. Framework-specific dashboards and reports
3. Regional compliance packs (EU Pack, US Pack, etc.)
4. Framework mapping documentation showing equivalences
5. Assessment mode toggles (RGAA-only, WCAG-only, Combined)
6. Custom framework builder in UI

This implementation delivers on the long-term vision of a truly framework-agnostic compliance platform while providing immediate value to organizations needing specific RGAA or WCAG compliance capabilities.
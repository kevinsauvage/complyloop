# Compliance Engineering Platform - Prioritized TODO List

## High Priority (Critical for MVP & Production)

### Domain Model & Data Consistency

- [ ] **Audit evidence append-only enforcement** - Verify DB trigger works correctly and add integration tests for evidence immutability
- [ ] **Implement requirement status derivation edge cases** - Handle `not_applicable`, `unable_to_verify` in `deriveRequirementStatus` for exceptions and human passes
- [ ] **Fix finding-act logic** - Review `src/core/finding-act.ts` decision tree for incomplete action paths (approve, reject, verify, generate patch, constest)

### Analysis Engine Gaps

- [ ] **Validate runtime-only checks waterfall** - Ensure AST-only scans properly skip runtime-only checks (e.g., contrast, flourish, placeholders-filling)
- [ ] **Implement heuristic check UI pathway** - Leave `unable_to_verify` status for checks requiring human review (caption-describedby, image-description, etc.)
- [ ] **Add site-level check validation** - Require ≥2 runtime URLs for site-level consistency checks

### Remediation Workflow

- [ ] **Build finding cluster remediation** - Implement "one PR for multiple findings" as per `src/core/remediation.ts` and `docs/ai/finding-flow.md`
- [ ] **Add source finding bulk remediation** - Currently only runtime findings support bulk actions in `remediation-run.ts`

## Medium Priority (Important Features & Documentation)

### Documentation & Coverage

- [ ] **Document finding-act state machine** - Add comprehensive docstring explaining action decision tree
- [ ] **Add check-authority rationale** - Document why certain checks are composition-sensitive or runtime-only

### UI/UX Improvements

- [ ] **Implement remediation history view** - Create UI to visualize `RemediationHistoryEntry` from findings
- [ ] **Add confidence indicators** - Display AI confidence levels in finding explanations
- [ ] **Build preset management UI** - Finalize `DefaultPresetForm` and persist presets properly
- [ ] **Add evidence export completeness** - Ensure all `EvidenceKind` variants are covered in exports

### AI Integration

- [ ] **Implement AI fallback chain** - When `AI_GATEWAY_API_KEY` not set, gracefully degrade from AI suggestions
- [ ] **Add certitude state visualization** - Show when findings require manual verification
- [ ] **Create AI verification workflow** - Complete `verified-fix.ts` integration with ComplyLoop verification

### Testing & Quality

- [ ] **Expand E2E for threaded hooks** - Test mutations and actions that rely on `@tanstack/react-table`
- [ ] **Add RBAC integration tests** - Cover all protected routes in `src/server/workspace.ts`
- [ ] **Create migration test harness** - Test DB migrations with `npm run test:coverage`
- [ ] **Add tautology check audit** - Review `src/analysis/checks/` for tautological or redundant checks

## Low Priority (Polish & Enhancement)

### Code Quality

- [ ] **Remove barrel re-exports from adapters** - Use direct imports instead of `index.ts` barrels
- [ ] **Audit EDT mutation handling** - Ensure all mutations have proper error boundaries
- [ ] **Add Suspense boundary wrappers** - Wrap data-fetching components for concurrent rendering
- [ ] **Conduct React Server Components audit** - Remove unnecessary client components

### Monitoring & Observability

- [ ] **Implement runtime coverage tracking** - Add UI indicators for runtime coverage percentages
- [ ] **Add remediation duration metrics** - Track time from finding detection to verification
- [ ] **Create health check endpoint** - Expose `/api/health` for Docker readiness

### Developer Experience

- [ ] **Add linting rule for domain violations** - ESLint rule to prevent imports from adapters/analysis in core/
- [ ] **Create story documentation** - Add Storybook stories for complex components
- [ ] **Prettify migration workflow** - Simplify `npm run db:migrate` with prettier formatting

### Performance

- [ ] **Apply React.memo to findings list** - Optimize virtualized finding queue
- [ ] **Implement React.Suspense for dialogs** - Lazy load complex remediation dialogs
- [ ] **Add bundle analysis to CI** - Run `next-bundle-analyzer` in CI pipeline

## Notes

- The core loop is: Requirement → Assessment → Finding → Explanation → Remediation → Verification → Evidence → Monitoring
- Stack decisions are documented in `docs/ai/architecture.md`
- Product scope decisions in `compliance-engineering-product-spec.md`
- Domain rules in `.cursor/rules/domain-model.mdc`

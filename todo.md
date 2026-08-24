# Compliance Engineering Platform - Todo List

> Last audited: 2026-08-24 against `src/` (see `docs/ai/architecture.md` for system shape).

## Known Issues

- [x] Fix failing unit test `src/components/org-account-overview.test.tsx` ("shows ownership, pilot plan, retention, and support contact"): summary chips render count and label as separate nodes (CSS gap), so the test now asserts chip structure instead of concatenated text.

## High Priority

### 1. Complete Accessibility Analysis Engine

- [x] Implement remaining WCAG 2.1 AA checks not yet covered by the existing checks (21 AST + 6 runtime-only)
- [x] Enhance runtime DOM audit capabilities with more comprehensive axe-core rules (axe-map covers ~60+ rules)
- [x] Improve SSRF protection for runtime URL safety checks (`ssrf-guard` + DNS resolution, port allowlist, redirect hop limits)
- [x] Add support for custom framework adapters beyond RGAA/WCAG (adapter registry, custom controls/checklist import)

### 2. Assessment Job System Reliability

- [x] Improve job queue lease pattern for better resilience across worker restarts (lease expiry recovery + exponential backoff retries in `assessment-jobs.ts`)
- [ ] Add job prioritization based on project importance and requirement criticality (queue is FIFO by `availableAt` only; no priority field)
- [x] Implement job cancellation and cleanup mechanisms (`cancelAssessmentJob` for queued jobs; `cancelled` terminal status)
- [ ] Add detailed job metrics and monitoring capabilities (only basic queued/running count exposed via `/api/health`)

### 3. Evidence Generation and Management

- [x] Enhance evidence HTML reports with better styling and printability
- [x] Implement JSON evidence export (`/evidence/export`)
- [ ] Add evidence export for PDF and CSV formats
- [ ] Add evidence verification and integrity checking (no checksums/hashes recorded)
- [ ] Implement evidence retention policies and archiving (evidence is append-only but unbounded)

### 4. Remediation Workflow Enhancements

- [ ] Improve AI-assisted remediation suggestions with better code quality (AI explainer/remediator exist; quality iteration ongoing)
- [x] Add automated fix generation for common accessibility issues (deterministic AST auto-fixes via `src/analysis/fixes.ts`; apply → commit/PR flow)
- [x] Implement remediation verification with automated re-checks (`verifyRemediationAction` re-runs the same engine that found the issue — AST re-scan or runtime axe re-audit — before `verified`)
- [x] Add manual approval workflow with detailed change tracking (approve/bulk-approve actions + historized remediation timeline)

### 5. Continuous Monitoring and Regression Detection

- [x] Implement webhook-based change detection for connected repositories (push/pull_request webhooks → idempotent re-assessment jobs, delivery dedupe)
- [ ] Add scheduled re-assessments for continuous compliance monitoring (webhook-triggered only; no cron/scheduler)
- [x] Implement regression detection alerts and notifications (in-app: `compliance_regression` alerts + dashboard alerts card + regression evidence records)
- [x] Add change impact analysis to show what changed between assessments (snapshot diff of file hashes + git blame attribution in `monitor.ts`)

## Medium Priority

### 6. User Interface Improvements

- [x] Enhance global design system with distinctive color palette and typography
- [x] Improve dashboard status counts with engineering-inspired visualizations
- [x] Enhance dashboard alerts card with better visual hierarchy
- [x] Improve assessment job status component with status indicators
- [x] Enhance findings list page with better card styling and hover effects
- [x] Significantly improve finding remediation card with engineering workflow visualization
- [x] Enhance finding explanations card with better information hierarchy
- [x] Improve finding action panel with better visual feedback and organized layouts
- [x] Add bulk operations for findings (approve, dismiss, etc.)
- [x] Implement keyboard navigation and accessibility improvements for UI
- [x] Polish page chrome (headers, empty states, loading, nav active state, workspace strip)
- [x] Upgrade finding detail (location, evidence trail, dismiss, handoff)
- [x] Align requirements cards/page with status tokens + summary chips
- [x] Rebuild evidence page as a tone-coded timeline
- [x] Polish org/account page and connect-project flows
- [x] Improve evidence HTML report print styling
- [x] Dark mode contrast pass across status accents

### 7. Testing and Quality Assurance

- [x] Increase test coverage for analysis engine edge cases (form-error, lists, viewport, autocomplete, axe-map, SSRF)
- [x] Raise unit coverage gate (~94%+ statements / ~96% lines on product surface via `npm run test:coverage`)
- [x] Add end-to-end tests for complete compliance loops
- [x] Improve error handling and user feedback mechanisms
- [x] Restore green unit suite (chip text-matcher fix in org-account-overview test)

### 8. Documentation and Onboarding

- [ ] Create comprehensive user guides and tutorials (only `docs/deploy.md` exists today)
- [ ] Add API documentation for developers integrating with the platform
- [ ] Improve inline code documentation and type definitions
- [ ] Create example configurations for different compliance frameworks

### 9. Security and Compliance Hardening

- [ ] Implement additional security headers and protections (no middleware / CSP / X-Frame-Options configured)
- [ ] Add audit logging for sensitive operations (org/member/remediation actions are historized in-domain but there is no dedicated audit log)
- [x] Enhance data encryption for sensitive information (GitHub tokens encrypted at rest with `AUTH_SECRET`; webhook signature verification)
- [ ] Add security scanning and vulnerability assessments

## Low Priority

### 10. Advanced Features and Integrations

- [ ] Add support for additional compliance frameworks (SOC 2, ISO 27001, etc.) — core/adapters are framework-agnostic and ready for new adapters
- [x] Implement CI/CD pipeline integrations for GitHub Actions (`@complyloop/check` npm package + `templates/github-actions/complyloop-check.yml`)
- [ ] Add GitLab CI integration for the CI gate package
- [ ] Add Slack and email notifications for compliance alerts (alerts currently in-app only)
- [ ] Create custom reporting and analytics dashboard

### 11. Performance Optimization

- [ ] Optimize AST parsing for large codebases (changed-file scoped re-scan partially addresses this)
- [ ] Implement caching for assessment results
- [x] Add incremental assessment capabilities (scoped re-scan of changed JSX when possible, full tree otherwise)
- [ ] Optimize database queries for large evidence sets

### 12. Internationalization and Localization

- [ ] Add support for multiple languages in UI (no i18n layer present)
- [ ] Implement localization for compliance requirement descriptions
- [ ] Add right-to-left (RTL) language support
- [ ] Implement region-specific compliance framework adaptations

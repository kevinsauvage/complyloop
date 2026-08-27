# Compliance Engineering Platform - Todo List

> Last audited: 2026-08-24 against `src/` (see `docs/ai/architecture.md` for system shape).
> Last updated: 2026-08-24 — added preset stacking UX, code cleanup, and new items below.

## Recently Completed (not previously tracked)

- [x] WCAG coverage: 8 AST heuristic checks (tier B) — pointer-gesture (2.5.1), pointer-cancellation (2.5.2), motion-actuation (2.5.4), focus-context-change (3.2.1), input-context-change (3.2.2), sensory-characteristics (1.3.3), image-of-text (1.4.5), error-suggestion (3.3.3). All emit `warning` + `confidence: "low"` → `needs_review` (never auto-fail). Added `heuristic-utils.ts`, registered in `registry.ts`, new `preset-heuristics`; 19 tests in `heuristic-checks.test.ts`. Reported controls 25 → 33.

## High Priority

### 2. Assessment Job System Reliability

- [ ] Add job prioritization based on project importance and requirement criticality (queue is FIFO by `availableAt` only; no priority field)
- [ ] Add detailed job metrics and monitoring capabilities (only basic queued/running count exposed via `/api/health`)

### 3. Evidence Generation and Management

- [ ] Add evidence export for PDF and CSV formats
- [ ] Add evidence verification and integrity checking (no checksums/hashes recorded)
- [ ] Implement evidence retention policies and archiving (evidence is append-only but unbounded)
- [ ] Add evidence search/filter by kind, control, date range
- [ ] Add evidence comparison between assessments (diff)

### 4. Remediation Workflow Enhancements

- [ ] Improve AI-assisted remediation suggestions with better code quality (AI explainer/remediator exist; quality iteration ongoing)

### 5. Continuous Monitoring and Regression Detection

- [ ] Add scheduled re-assessments for continuous compliance monitoring (webhook-triggered only; no cron/scheduler)
- [ ] Add webhook retry with exponential backoff for failed deliveries
- [ ] Add assessment history pagination & trend charts (currently latest only)

## Medium Priority

### 6. User Interface Improvements

### 7. Testing and Quality Assurance

### 8. Documentation and Onboarding

- [ ] Create comprehensive user guides and tutorials (only `docs/deploy.md` exists today)
- [ ] Add API documentation for developers integrating with the platform
- [ ] Improve inline code documentation and type definitions
- [ ] Create example configurations for different compliance frameworks

### 9. Security and Compliance Hardening

- [ ] Implement additional security headers and protections (no middleware / CSP / X-Frame-Options configured)
- [ ] Add audit logging for sensitive operations (org/member/remediation actions are historized in-domain but there is no dedicated audit log)
- [ ] Add security scanning and vulnerability assessments
- [ ] Add API rate limiting beyond current per-IP window
- [ ] Add project deletion with configurable data retention (currently only org-level)

## Low Priority

### 10. Advanced Features and Integrations

- [ ] Add support for additional compliance frameworks (SOC 2, ISO 27001, etc.) — core/adapters are framework-agnostic and ready for new adapters
- [ ] Add GitLab CI integration for the CI gate package
- [ ] Add Slack and email notifications for compliance alerts (alerts currently in-app only)
- [ ] Create custom reporting and analytics dashboard
- [ ] Add project duplication/clone with scoped controls
- [ ] Add project configuration export/import (JSON)
- [ ] Add requirement search, filter, and bulk scope operations

### 11. Performance Optimization

- [ ] Optimize AST parsing for large codebases (changed-file scoped re-scan partially addresses this)
- [ ] Implement caching for assessment results
- [ ] Optimize database queries for large evidence sets
- [ ] Add performance budget & bundle size monitoring for dashboard

### 12. Internationalization and Localization

- [ ] Add support for multiple languages in UI (no i18n layer present)
- [ ] Implement localization for compliance requirement descriptions
- [ ] Add right-to-left (RTL) language support
- [ ] Implement region-specific compliance framework adaptations

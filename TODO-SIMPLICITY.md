# TODO — Simplicity

All audit items from 2026-09-08 are **done**. Re-audit when adding layers.

## Completed

| ID | Change |
| ---- | ------ |
| P0-1 | Single `getWorkspace`; deleted dual viewer loaders |
| P1-1 | `includeRuntime: false` on tenancy-only writes |
| P1-2 | `getProjectRuntime` → `loadProjectRuntime` (repo `list*`) |
| P1-3 | `github-helpers.ts`; cycle broken; `connect-github.test.ts` |
| P1-4 | `applyEntityWrite` in `assessment-status`; no `evidenceEntry` re-export |
| P1-5 | Static imports in `loadReportInput` |
| P2-1 | `CreatePrForm` uses `useActionToast` success action |
| P2-2 | Dropped redundant form-state aliases |
| P2-3 | Scope helpers in `project-scope.ts` |
| P2-4 | Report colors in `report-html/report-colors.ts` |
| P2-5 | Job schemas only from `assessment-job.ts` |
| P2-6 | Tests prefer `@complyloop/db/types` `emptyDb` |
| P3-1 | Renamed connect test file |
| P3-2 | Kept `check-ids.ts` stable export path (intentional) |
| P3-3 | No change (guidance only) |

Verify after further edits:

```bash
npm run lint && npm run typecheck && npm run test && npm run build
```
